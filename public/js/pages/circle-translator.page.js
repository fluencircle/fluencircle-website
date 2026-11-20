/**
 * @file Circle Tradutor (circle-translator.html) — página pública, sem login.
 *
 * Usada nas sessões presenciais: a tradução sempre funciona sem login; salvar
 * a tradução como flashcard da sessão no ar (`current_session`) depende do
 * ambiente (config/environment.js → publicTranslatorSavesFlashcards):
 * - ligado (produção, por compatibilidade): tenta gravar direto no RTDB. Se as
 *   regras negarem (a proposta nega escrita anônima — Issue #5), a tradução
 *   continua na tela e a pessoa vê que o card NÃO foi salvo;
 * - desligado (Emulator): não tenta gravar. O caminho correto é o backend
 *   controlado (docs/backend/CONTRATO_BACKEND.md), ainda não disponível.
 * Erros de tradução e de gravação têm mensagens diferentes.
 * A exibição como texto ajuda contra XSS, mas não resolve autorização.
 */
import { watchCurrentSession } from '../services/sessions.service.js';
import { addFlashcard } from '../services/flashcards.service.js';
import { translateText } from '../services/translate.service.js';
import { TRANSLATOR_MAX_LENGTH } from '../config/app.config.js';
import { canSaveTranslationToSession } from '../domain/active-session.js';
import { isPermissionDenied } from '../domain/errors.js';
import { currentEnvironment } from '../config/environment.js';
import { byId } from '../ui/dom.js';
import { mountEnvironmentBadge } from '../ui/environment-badge.js';

/** Tema gravado no flashcard quando a sessão ativa não informa um. */
const DEFAULT_TOPIC = 'Circle Tradutor';

const sourceInput = byId('sourceText');
const resultInput = byId('targetText');
const translateButton = byId('translateBtn');
const statusMessage = byId('statusMessage');
const sessionLabel = byId('sessionName');

/** Sessão em andamento, atualizada em tempo real. */
let activeSession = null;
let pendingTranslation = null;

/**
 * @param {string} text
 * @param {'info'|'success'|'warning'|'error'} type
 */
function showStatus(text, type = 'info') {
  statusMessage.textContent = text;
  statusMessage.className = `status-message ${type}`;
}

function clearStatus() {
  statusMessage.textContent = '';
  statusMessage.className = 'status-message';
}

function setTranslationBusy(busy) {
  translateButton.disabled = busy;
  translateButton.textContent = busy ? 'Traduzindo...' : 'Traduzir';
}

function renderSessionLabel() {
  sessionLabel.textContent = activeSession ? `Sessão ativa: ${activeSession.topic}` : 'Nenhuma sessão ativa no momento';
  sessionLabel.classList.toggle('session-label--active', Boolean(activeSession));
}

async function handleTranslate() {
  if (pendingTranslation) return;
  const text = sourceInput.value.trim();
  if (!text) {
    showStatus('Por favor, digite uma palavra ou frase.', 'warning');
    return;
  }

  // Salvar o id da aula antes de aguardar o backend assíncrono.
  const request = { session: activeSession, text };
  pendingTranslation = request;
  setTranslationBusy(true);
  resultInput.value = '';
  clearStatus();
  try {
    let translation;
    try {
      translation = await translateText(text);
    } catch (error) {
      if (pendingTranslation !== request) return;
      console.error('Erro na tradução:', error);
      showStatus('Não foi possível traduzir agora. Tente novamente.', 'error');
      return;
    }
    if (pendingTranslation !== request) return;
    resultInput.value = translation;
    if (request.session && translation) await saveTranslation(request, translation);
  } finally {
    if (pendingTranslation === request) {
      pendingTranslation = null;
      setTranslationBusy(false);
    }
  }
}

/** Tenta salvar a tradução como flashcard da sessão no ar, conforme o ambiente. */
async function saveTranslation(request, back) {
  const { session: originSession, text: front } = request;
  if (!currentEnvironment.publicTranslatorSavesFlashcards) {
    showStatus('Tradução concluída. Neste ambiente o tradutor público não salva flashcards automaticamente.', 'info');
    return;
  }
  if (!canSaveTranslationToSession(originSession, activeSession)) {
    showStatus('A sessão mudou durante a tradução. O texto não foi salvo como flashcard.', 'warning');
    return;
  }
  try {
    await addFlashcard(originSession.sessionId, { front, back, topic: originSession.topic || DEFAULT_TOPIC });
    if (pendingTranslation !== request) return;
    showStatus(`Flashcard salvo na sessão "${originSession.topic || DEFAULT_TOPIC}".`, 'success');
  } catch (error) {
    if (pendingTranslation !== request) return;
    console.error('Erro ao salvar o flashcard:', error);
    showStatus(isPermissionDenied(error)
      ? 'Tradução concluída, mas o flashcard não foi salvo: a gravação pública está bloqueada pelas regras de segurança.'
      : 'Tradução concluída, mas não foi possível salvar o flashcard. Tente novamente.', 'warning');
  }
}

mountEnvironmentBadge();
sourceInput.maxLength = TRANSLATOR_MAX_LENGTH;
translateButton.addEventListener('click', handleTranslate);
sourceInput.addEventListener('input', () => {
  pendingTranslation = null;
  setTranslationBusy(false);
  resultInput.value = '';
  clearStatus();
});
sourceInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.repeat && !event.isComposing) handleTranslate();
});

watchCurrentSession((session) => {
  activeSession = session;
  renderSessionLabel();
});
