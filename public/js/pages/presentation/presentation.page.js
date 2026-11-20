/**
 * @file Sessão ao vivo (presentation.html): escolher tema, conduzir os slides,
 * marcar presença e criar flashcards com o tradutor.
 *
 * Restrito a mediadores e administradores. Fluxo:
 *   seleção do tema → "Iniciar" (pergunta antes de assumir o tradutor se outra
 *   tela estiver no ar; cria a sessão e a publica com posse desta aba)
 *   → slides em tela cheia → "Encerrar" (despublica só se esta aba for a dona).
 *
 * Posse da sessão ativa (Issue #9): ver domain/presentation-lock.js. Se outra
 * tela assumir o tradutor, esta continua registrando presença e cards na
 * PRÓPRIA sessão e mostra o aviso na barra de status.
 */
import { initProtectedPage } from '../shared/page-setup.js';
import { createSession, publishCurrentSession, getCurrentSession, createPresenterId, deleteSession } from '../../services/sessions.service.js';
import { openLiveRoom } from '../../services/live-rooms.service.js';
import { isPresentationLive } from '../../domain/presentation-lock.js';
import { nowIso, formatDateTime } from '../../domain/format.js';
import { STAFF_ROLES } from '../../core/roles.js';
import { PAGES } from '../../core/navigation.js';
import { currentEnvironment } from '../../config/environment.js';
import { byId } from '../../ui/dom.js';
import { showToast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm-dialog.js';
import { setPresentationMode } from '../../ui/app-shell.js';
import { createThemePicker } from './theme-picker.js';
import { createSlideDeck } from './slides.js';
import { createAttendance } from './attendance.js';
import { createTranslatorModal } from './translator-modal.js';

const selectView = document.querySelector('.select-content');
const slideView = document.querySelector('.slide-content');
const startButton = byId('start-presentation-btn');
const statusLabel = byId('presentation-status');
const sharePublicTranslator = byId('share-public-translator');
const roomLink = byId('open-live-room');
const floatingButtons = [byId('open-translator-btn'), byId('open-attendance-btn')];

/** Estado da tela. */
const state = {
  /** @type {import('./theme-picker.js').SelectedTheme | null} */
  selectedTheme: null,
  /** @type {{ id: string, topic: string, startedAt: string } | null} sessão em andamento */
  activeSession: null,
  /** @type {import('../../services/sessions.service.js').PresentationHandle | null} publicação no tradutor */
  presentation: null,
  room: null,
  /** Identifica esta aba como dona da publicação (um por carregamento de página). */
  presenterId: createPresenterId(),
  mediatorEmail: '',
  mediatorUid: '',
};

/** Texto da barra de status para cada situação da publicação. */
const STATUS_MESSAGES = Object.freeze({
  live: { text: 'Publicada no tradutor público.', tone: 'ok' },
  private: { text: 'Sessão disponível nos círculos ao vivo.', tone: 'ok' },
  'room-unavailable': { text: 'Sala ao vivo indisponível.', tone: 'warning' },
  reconnecting: { text: 'Sem conexão: o tradutor público não mostra esta sessão até a rede voltar.', tone: 'warning' },
  offline: { text: 'Reconectando a sessão ao tradutor público...', tone: 'warning' },
  'taken-over': { text: 'Outra tela assumiu o tradutor público. Presença e cards continuam salvos nesta sessão.', tone: 'error' },
  ended: { text: 'A publicação no tradutor foi encerrada em outra tela. Presença e cards continuam salvos nesta sessão.', tone: 'error' },
});

function renderPresentationStatus(status) {
  const message = STATUS_MESSAGES[status];
  statusLabel.textContent = message ? message.text : '';
  statusLabel.dataset.tone = message ? message.tone : '';
}

function handlePresentationStatus(status) {
  renderPresentationStatus(status);
  if (status === 'taken-over') showToast('Outra tela assumiu a sessão ativa do tradutor.', 'error');
}

/**
 * Se outra tela estiver no ar no tradutor, pergunta antes de assumir.
 * @returns {Promise<import('../../domain/presentation-lock.js').CurrentSession|false|null>} publicação confirmada, false se livre ou null se cancelada
 */
async function askTakeoverIfNeeded() {
  const current = await getCurrentSession();
  if (!isPresentationLive(current) || current.presenterId === state.presenterId) return false;
  const since = current.startedAt ? ` desde ${formatDateTime(current.startedAt)}` : '';
  const confirmed = await confirmDialog({
    title: 'Já existe uma sessão no tradutor',
    message: `"${current.topic || 'Sessão sem tema'}" está sendo apresentada${since} em outra tela.`,
    detail: 'O tradutor público mostra uma sessão por vez. Ao assumir, as traduções passam para esta nova sessão e a outra tela é avisada.',
    confirmText: 'Assumir o tradutor',
    cancelText: 'Cancelar',
  });
  return confirmed ? current : null;
}

// Evita clique repetido enquanto uma operação assíncrona está em andamento.
let isStarting = false;
let isEnding = false;

const slides = createSlideDeck(document.querySelector('.slide'), (text) => {
  state.room?.updateSlide(text).catch((error) => {
    console.error('Falha ao compartilhar slide:', error);
    showToast('Falha ao atualizar o slide na sala ao vivo.', 'error');
  });
});
const attendance = createAttendance(() => state.activeSession);
const translator = createTranslatorModal(() => state.activeSession);
const themePicker = createThemePicker({
  trigger: byId('presentation-select'),
  list: byId('option-list'),
  valueText: byId('value'),
  loader: byId('themes-loader'),
}, (theme) => {
  state.selectedTheme = theme;
  setStartEnabled(true);
});

function setStartEnabled(enabled) {
  startButton.classList.toggle('unclickable', !enabled);
  startButton.setAttribute('aria-disabled', String(!enabled));
  startButton.disabled = !enabled;
}

function showSessionUI(active) {
  selectView.classList.toggle('hidden', active);
  slideView.classList.toggle('hidden', !active);
  floatingButtons.forEach((button) => button.classList.toggle('hidden', !active));
  setPresentationMode(active);
}

async function startSession() {
  if (!state.selectedTheme || state.activeSession || isStarting || isEnding) return;
  isStarting = true;
  const { id: templateId, topic, questions } = state.selectedTheme;

  setStartEnabled(false);
  startButton.textContent = 'Iniciando...';
  let sessionId;
  let roomUnavailable = false;
  try {
    const shouldPublish = !currentEnvironment.liveRooms || sharePublicTranslator.checked;
    const takeover = shouldPublish ? await askTakeoverIfNeeded() : false;
    if (takeover === null) return;

    const startedAt = nowIso();
    sessionId = await createSession({ templateId, topic, mediatorEmail: state.mediatorEmail, startedAt });
    if (shouldPublish) {
      const result = await publishCurrentSession({ sessionId, topic, startedAt }, {
        presenterId: state.presenterId,
        takeover,
        onStatusChange: handlePresentationStatus,
      });
      if (result.status === 'conflict') {
        showToast('Outra sessão entrou no tradutor enquanto você iniciava. Tente novamente.', 'error');
        return;
      }
      state.presentation = result.presentation;
    }
    if (currentEnvironment.liveRooms) {
      try {
        state.room = await openLiveRoom({ id: sessionId, topic, hostUid: state.mediatorUid });
        roomLink.href = `${PAGES.home}?${new URLSearchParams({ sala: sessionId })}`;
        roomLink.classList.remove('hidden');
      } catch (error) {
        console.error('Falha ao abrir sala ao vivo:', error);
        if (!shouldPublish) {
          showToast('Falha ao abrir a sala ao vivo. Tente iniciar novamente.', 'error');
          return;
        }
        roomUnavailable = true;
      }
    }

    state.activeSession = { id: sessionId, topic, startedAt };
    renderPresentationStatus(shouldPublish ? 'live' : 'private');
    attendance.reset();
    showSessionUI(true);
    slides.start(topic, questions);
    showToast(roomUnavailable ? STATUS_MESSAGES['room-unavailable'].text : 'Sessão iniciada', roomUnavailable ? 'error' : 'success');
  } catch (error) {
    console.error('Erro ao registrar sessão:', error);
    showToast('Falha ao iniciar evento no banco.', 'error');
  } finally {
    if (sessionId && !state.activeSession) {
      await deleteSession(sessionId).catch((error) => console.error('Não foi possível descartar a sessão criada:', error));
    }
    isStarting = false;
    setStartEnabled(!state.activeSession && Boolean(state.selectedTheme));
    startButton.textContent = 'Iniciar';
  }
}

async function endSession() {
  if (!state.activeSession || isEnding || isStarting) return;
  isEnding = true;
  try {
    const confirmed = await confirmDialog({
      title: 'Encerrar sessão',
      message: 'Tem certeza de que deseja finalizar esta sessão de conversação?',
      detail: 'Todos os flashcards criados durante a sessão já estão salvos para os participantes.',
      confirmText: 'Sim, Encerrar',
      cancelText: 'Continuar sessão',
      showCloseButton: true,
    });
    if (!confirmed) return;

    // Erro de despublicação não é sucesso. Preservamos a sessão na tela
    // para que o mediador possa tentar novamente sem deixar um evento órfão.
    if (state.room) {
      await state.room.stop();
      state.room = null;
      roomLink.classList.add('hidden');
    }
    const outcome = await state.presentation?.stop();
    state.activeSession = null;
    state.presentation = null;
    renderPresentationStatus(null);

    attendance.close();
    translator.close();
    showSessionUI(false);
    // Se outra tela já tinha assumido, o nó dela fica intacto (só a dona remove).
    showToast(outcome === 'not-owner'
      ? 'Sessão encerrada nesta tela. O tradutor público segue com a outra apresentação.'
      : 'Sessão encerrada', 'success');
  } catch (error) {
    console.error('Não foi possível retirar a sessão ativa do banco:', error);
    showToast('Falha ao encerrar no banco. Confira a conexão e tente novamente.', 'error');
  } finally {
    isEnding = false;
  }
}

/** Navegação pelos slides só vale com a sessão na tela e sem modal/gaveta abertos. */
function canNavigate() {
  return !slideView.classList.contains('hidden') && !translator.isOpen() && !attendance.isOpen()
    && !document.querySelector('.modal--confirm');
}

startButton.addEventListener('click', startSession);
byId('end-meeting-btn').addEventListener('click', (event) => {
  event.stopPropagation();
  endSession();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    themePicker.close();
    attendance.close();
    return;
  }
  if (!canNavigate() || (event.target instanceof Element
      && event.target.closest('button, a, input, textarea, select, [contenteditable]'))) return;
  if (event.key === 'ArrowRight' || event.key === ' ') {
    event.preventDefault();
    slides.next();
  } else if (event.key === 'ArrowLeft') {
    slides.previous();
  }
});

// Clique na metade direita avança; na esquerda, volta. O cursor mostra a direção.
slideView.addEventListener('click', (event) => {
  if (event.target.closest('.meeting-status-bar, .translation-button, .attendance-toggle-btn, .attendance-drawer')) return;
  if (event.clientX > window.innerWidth / 2) slides.next();
  else slides.previous();
});
slideView.addEventListener('mousemove', (event) => {
  const isLeft = event.clientX < window.innerWidth / 2;
  slideView.classList.toggle('cursor-left', isLeft);
  slideView.classList.toggle('cursor-right', !isLeft);
});

const session = await initProtectedPage({ allowedRoles: STAFF_ROLES, deniedMessage: 'Acesso restrito a Mediadores.' });
if (session) {
  state.mediatorEmail = session.user.email;
  state.mediatorUid = session.user.uid;
  byId('public-translator-option').classList.toggle('hidden', !currentEnvironment.liveRooms);
  await Promise.all([themePicker.load(), attendance.loadStudents()]);
}
