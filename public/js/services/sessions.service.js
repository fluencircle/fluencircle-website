/**
 * @file Sessões de conversação (`meeting_sessions`), presença e sessão ativa.
 *
 * `current_session` é um nó único lido pelo tradutor público para saber em
 * qual sessão salvar os flashcards. Desde a Issue #9 ele tem POSSE por aba
 * (`presenterId`), versão e presença por aba (`live/{presenterId}`): a lógica
 * de decisão está em domain/presentation-lock.js e as regras do banco
 * conferem o mesmo protocolo. Migração futura para salas por código/QR:
 * docs/engenharia/ADR-003-SESSAO-ATIVA.md.
 */
import { database, ref, get, set, push, update, onValue, onDisconnect, runTransaction } from '../core/firebase.js';
import { nowIso } from '../domain/format.js';
import {
  publicSessionFrom, ownershipStatus, publishTransaction, unpublishTransaction, reconnectTransaction,
} from '../domain/presentation-lock.js';
import { buildAddAttendeeUpdates, buildRemoveAttendeeUpdates, buildDeleteSessionUpdates } from './session-updates.js';
import { DB_PATHS, dbPath } from './db-paths.js';

/**
 * @typedef {Object} Session
 * @property {string} [templateId] id do tema usado
 * @property {string} [topic]
 * @property {string} [startedAt]
 * @property {string} [mediatorEmail]
 * @property {Record<string, { addedAt: string }>} [attendees] dados antigos podem ter também name/email
 */

/** @returns {Promise<Record<string, Session>>} todas as sessões, por id */
export async function listSessions() {
  const snapshot = await get(ref(database, DB_PATHS.sessions));
  return snapshot.exists() ? snapshot.val() : {};
}

/**
 * Registra o início de uma sessão.
 * @param {{ templateId: string, topic: string, mediatorEmail: string, startedAt?: string }} data
 * @returns {Promise<string>} id da sessão
 */
export async function createSession({ templateId, topic, mediatorEmail, startedAt = nowIso() }) {
  const sessionRef = push(ref(database, DB_PATHS.sessions));
  await set(sessionRef, { templateId, topic, startedAt, mediatorEmail, attendees: {} });
  return sessionRef.key;
}

/**
 * Id aleatório (128 bits, base64url) que identifica ESTA aba como dona da
 * apresentação. Não é segredo nem dado pessoal; só evita colisão entre abas.
 */
export function createPresenterId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @returns {Promise<import('../domain/presentation-lock.js').CurrentSession | null>} */
export async function getCurrentSession() {
  const snapshot = await get(ref(database, DB_PATHS.currentSession));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * @typedef {'live'|'reconnecting'|'offline'|'taken-over'|'ended'} PresentationStatus
 * @typedef {Object} PresentationHandle
 * @property {string} presenterId
 * @property {() => Promise<'removed'|'not-owner'|'already-gone'>} stop encerra a publicação (só remove se for a dona)
 */

/**
 * Publica a sessão como ativa para o tradutor público, com posse desta aba.
 *
 * A transação exige que a confirmação de substituição corresponda à publicação que ainda está no ar.
 *
 * @param {{ sessionId: string, topic: string, startedAt: string }} session
 * @param {{ presenterId: string, takeover?: import('../domain/presentation-lock.js').CurrentSession|false, onStatusChange?: (status: PresentationStatus) => void }} options
 * @returns {Promise<{ status: 'published', presentation: PresentationHandle } | { status: 'conflict', current: object }>}
 */
export async function publishCurrentSession({ sessionId, topic, startedAt }, { presenterId, takeover = false, onStatusChange = () => {} }) {
  const currentRef = ref(database, DB_PATHS.currentSession);
  const liveRef = ref(database, dbPath(DB_PATHS.currentSession, 'live', presenterId));

  const publish = publishTransaction({ sessionId, topic, startedAt, presenterId }, { takeover });
  const result = await runTransaction(currentRef, publish.update);
  if (!result.committed) return { status: 'conflict', current: publish.lastPlan()?.current ?? result.snapshot.val() };

  // Só agora (já dona) registra a remoção da PRÓPRIA presença ao cair.
  // Se o registro falhar, desfaz a publicação para não deixar presença eterna.
  try {
    await onDisconnect(liveRef).remove();
  } catch (error) {
    await runTransaction(currentRef, unpublishTransaction(presenterId).update).catch(() => {});
    throw error;
  }
  return { status: 'published', presentation: watchPresentation({ presenterId, currentRef, liveRef, onStatusChange }) };
}

/** Acompanha posse e conexão de uma apresentação publicada por esta aba. */
function watchPresentation({ presenterId, currentRef, liveRef, onStatusChange }) {
  let lastStatus = 'live';
  let connected = true;
  let wasDisconnected = false;
  let stopped = false;
  let ending = false; // durante o próprio encerramento, a remoção do nó não é "encerrada por outra tela"
  const emit = (status) => {
    if (stopped || ending || status === lastStatus) return;
    lastStatus = status;
    onStatusChange(status);
  };

  // Mudanças de dono em tempo real (outra aba assumiu ou alguém encerrou).
  // Também mantém o cache local, que as transações usam na primeira tentativa.
  const stopOwnership = onValue(currentRef, (snapshot) => {
    const status = ownershipStatus(snapshot.val(), presenterId);
    emit(!connected && status === 'offline' ? 'reconnecting' : status);
  });

  const stopConnection = onValue(ref(database, '.info/connected'), async (snapshot) => {
    connected = snapshot.val() === true;
    if (!connected) {
      wasDisconnected = true;
      emit('reconnecting');
      return;
    }
    if (!wasDisconnected) return;
    wasDisconnected = false;
    try {
      // O onDisconnect anterior já disparou: registra de novo e restaura a presença, se ainda for a dona.
      await onDisconnect(liveRef).remove();
      const reconnect = reconnectTransaction(presenterId);
      const restored = await runTransaction(currentRef, reconnect.update);
      emit(restored.committed && reconnect.lastPlan()?.outcome === 'write'
        ? 'live'
        : ownershipStatus(restored.snapshot.val(), presenterId));
    } catch (error) {
      console.error('Não foi possível restaurar a sessão ativa após reconectar:', error);
      emit('offline');
    }
  });

  return {
    presenterId,
    async stop() {
      ending = true;
      try {
        const end = unpublishTransaction(presenterId);
        await runTransaction(currentRef, end.update);
        stopped = true;
        stopOwnership();
        stopConnection();
        await onDisconnect(liveRef).cancel().catch(() => {});
        const outcome = end.lastPlan()?.outcome;
        return outcome === 'remove' ? 'removed' : outcome;
      } finally {
        ending = false;
      }
    },
  };
}

/**
 * Observa a sessão ativa (usado pelo tradutor público). Só entrega sessão
 * "no ar" (dona conectada) e só id e título.
 * @param {(session: { sessionId: string, topic: string } | null) => void} callback
 * @returns {() => void} função para parar de observar
 */
export function watchCurrentSession(callback) {
  return onValue(ref(database, DB_PATHS.currentSession), (snapshot) => {
    callback(publicSessionFrom(snapshot.val()));
  });
}

/**
 * Marca presença e índice em um único update atômico; propaga falhas de regras.
 * @param {{ id: string, topic: string, startedAt: string }} session sessão em andamento
 * @param {string} uid aluno
 */
export function addAttendee(session, uid) {
  return update(ref(database), buildAddAttendeeUpdates(session.id, uid, { topic: session.topic, startedAt: session.startedAt }, nowIso()));
}

/**
 * Índice de presença do próprio aluno (`user_sessions/{uid}`).
 * @param {string} uid
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getUserSessionIndex(uid) {
  const snapshot = await get(ref(database, dbPath(DB_PATHS.userSessions, uid)));
  return snapshot.exists() ? snapshot.val() : {};
}

/**
 * Tema e início de UMA sessão, lidos campo a campo (as regras liberam só esses
 * campos para quem participou). Usado para entradas antigas do índice (`true`).
 * @param {string} sessionId
 * @returns {Promise<{ topic: string, startedAt: string } | null>} null se a sessão não existe mais
 */
export async function getSessionSummary(sessionId) {
  const [topic, startedAt] = await Promise.all([
    get(ref(database, dbPath(DB_PATHS.sessions, sessionId, 'topic'))),
    get(ref(database, dbPath(DB_PATHS.sessions, sessionId, 'startedAt'))),
  ]);
  if (!topic.exists() && !startedAt.exists()) return null;
  return { topic: topic.val() || '', startedAt: startedAt.val() || '' };
}

/**
 * Remove presença e índice reverso conjuntamente.
 * Antes a segunda operação podia falhar silenciosamente e deixar índice órfão.
 */
export function removeAttendee(sessionId, uid) {
  return update(ref(database), buildRemoveAttendeeUpdates(sessionId, uid));
}

/**
 * Remove sessão, flashcards e índices informados em um update multicaminho.
 * Se faltar permissão em qualquer caminho, a operação inteira é rejeitada.
 * Uma lista de participantes desatualizada ainda exige reconciliação futura.
 */
export function deleteSession(sessionId, attendeeUids = []) {
  return update(ref(database), buildDeleteSessionUpdates(sessionId, attendeeUids));
}
