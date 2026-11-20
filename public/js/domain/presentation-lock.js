/**
 * @file Posse da sessão ativa (`current_session`) — decisões puras (Issue #9).
 *
 * Problema antigo: `current_session` é um nó único e cada aba registrava
 * `onDisconnect().remove()` NELE. Uma aba antiga que caísse apagava a sessão
 * que outro mediador (ou outra aba) tinha publicado depois, e duas publicações
 * se sobrescreviam em silêncio.
 *
 * Modelo novo (compatível com o tradutor e com o nó único):
 * - cada aba que apresenta tem um `presenterId` aleatório (posse);
 * - `version` cresce a cada troca de dono (concorrência otimista, conferida
 *   também pelas regras do banco);
 * - `live/{presenterId}: true` é a presença da aba dona; o `onDisconnect` de
 *   cada aba apaga SÓ a própria chave — uma aba antiga não derruba a nova;
 * - publicar por cima de uma apresentação viva exige confirmação explícita
 *   ("assumir") e grava `takeoverOf` com o dono anterior;
 * - encerrar e reconectar só alteram o nó se esta aba ainda for a dona.
 *
 * Tudo aqui é puro: as funções `*Transaction` devolvem o atualizador usado por
 * `runTransaction` no serviço e pelos testes de regras no Emulator.
 */

/** Formato do id de posse (o mesmo que as regras exigem). */
export const PRESENTER_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** @param {unknown} id */
export function isValidPresenterId(id) {
  return typeof id === 'string' && PRESENTER_ID_PATTERN.test(id);
}

/**
 * @typedef {Object} CurrentSession
 * @property {string} sessionId
 * @property {string} topic
 * @property {string} [startedAt]
 * @property {string} [presenterId] ausente no formato antigo
 * @property {number} [version] ausente no formato antigo
 * @property {string} [takeoverOf]
 * @property {Record<string, true>} [live]
 */

/** Formato antigo, gravado antes desta mudança (sem dono nem versão). */
export function isLegacyPresentation(current) {
  return Boolean(current?.sessionId) && !current.presenterId;
}

/**
 * A apresentação está no ar? Formato antigo conta como "no ar" (não há como
 * saber o dono), para o tradutor continuar funcionando durante a transição.
 * @param {CurrentSession|null|undefined} current
 */
export function isPresentationLive(current) {
  if (!current || typeof current !== 'object' || !current.sessionId) return false;
  if (!current.presenterId) return true;
  return current.live?.[current.presenterId] === true;
}

/**
 * O que o tradutor público deve usar: só sessão no ar, só id e título.
 * @returns {{ sessionId: string, topic: string } | null}
 */
export function publicSessionFrom(current) {
  return isPresentationLive(current) ? { sessionId: current.sessionId, topic: current.topic || '' } : null;
}

/**
 * Situação da posse vista por uma aba.
 * @returns {'live'|'offline'|'taken-over'|'ended'}
 */
export function ownershipStatus(current, presenterId) {
  if (!current) return 'ended';
  if (current.presenterId !== presenterId) return 'taken-over';
  return current.live?.[presenterId] === true ? 'live' : 'offline';
}

/**
 * Decide o que gravar ao publicar.
 * @param {CurrentSession|null} current valor atual do nó
 * @param {{ sessionId: string, topic: string, startedAt: string, presenterId: string }} intent
 * @param {{ takeover?: CurrentSession|false }} [options] publicação específica confirmada pela pessoa
 * @returns {{ outcome: 'write', value: CurrentSession } | { outcome: 'conflict', current: CurrentSession }}
 */
export function planPublish(current, { sessionId, topic, startedAt, presenterId }, { takeover = false } = {}) {
  if (!isValidPresenterId(presenterId)) throw new TypeError('presenterId inválido.');
  const value = { sessionId, topic, startedAt, presenterId, version: 1, live: { [presenterId]: true } };
  if (!current) return { outcome: 'write', value };
  if (current.presenterId === presenterId) {
    return { outcome: 'write', value: { ...value, version: current.version } };
  }
  const live = isPresentationLive(current);
  const confirmed = takeover && takeover.sessionId === current.sessionId
    && takeover.presenterId === current.presenterId && takeover.version === current.version;
  if (live && !confirmed) return { outcome: 'conflict', current };
  if (Number.isInteger(current.version)) value.version = current.version + 1;
  if (live && current.presenterId) value.takeoverOf = current.presenterId;
  return { outcome: 'write', value };
}

/**
 * Decide o encerramento: só a aba dona remove o nó.
 * @returns {{ outcome: 'remove' } | { outcome: 'not-owner', current: CurrentSession } | { outcome: 'already-gone' }}
 */
export function planUnpublish(current, presenterId) {
  if (!current) return { outcome: 'already-gone' };
  if (current.presenterId !== presenterId) return { outcome: 'not-owner', current };
  return { outcome: 'remove' };
}

/**
 * Decide o que fazer quando a conexão volta: se ainda é a dona, restaura a
 * presença; senão, a posse foi perdida.
 * @returns {{ outcome: 'write', value: CurrentSession } | { outcome: 'lost', current: CurrentSession|null }}
 */
export function planReconnect(current, presenterId) {
  if (!current || current.presenterId !== presenterId) return { outcome: 'lost', current: current || null };
  return { outcome: 'write', value: { ...current, live: { [presenterId]: true } } };
}

/*
 * Atualizadores para runTransaction. Convenções do RTDB: devolver um valor
 * grava; `null` apaga; `undefined` desiste. Quando o cache local ainda não tem
 * o valor, o SDK chama a função com `null` primeiro: por isso, nos casos de
 * "não existe", devolvemos `null` (o servidor confere e chama de novo com o
 * valor real, se houver) em vez de desistir cedo demais.
 */

/** @returns {{ update: (current: any) => any, lastPlan: () => ReturnType<typeof planPublish> | null }} */
export function publishTransaction(intent, options = {}) {
  let last = null;
  return {
    update: (current) => {
      last = planPublish(current, intent, options);
      return last.outcome === 'write' ? last.value : undefined;
    },
    lastPlan: () => last,
  };
}

/** @returns {{ update: (current: any) => any, lastPlan: () => ReturnType<typeof planUnpublish> | null }} */
export function unpublishTransaction(presenterId) {
  let last = null;
  return {
    update: (current) => {
      last = planUnpublish(current, presenterId);
      return last.outcome === 'not-owner' ? undefined : null;
    },
    lastPlan: () => last,
  };
}

/** @returns {{ update: (current: any) => any, lastPlan: () => ReturnType<typeof planReconnect> | null }} */
export function reconnectTransaction(presenterId) {
  let last = null;
  return {
    update: (current) => {
      last = planReconnect(current, presenterId);
      if (last.outcome === 'write') return last.value;
      return current === null ? null : undefined;
    },
    lastPlan: () => last,
  };
}
