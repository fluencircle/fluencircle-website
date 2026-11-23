/**
 * @file Tradutor da sessão ao vivo: traduz pelo backend e salva o par como flashcard.
 */
import { translateText } from '../../services/translate.service.js';
import { addFlashcard } from '../../services/flashcards.service.js';
import { TRANSLATOR_MAX_LENGTH } from '../../config/app.config.js';
import { byId, setBusy } from '../../ui/dom.js';
import { showToast } from '../../ui/toast.js';

/** Classe que marca o botão "Salvar Flashcard" como indisponível (sem tradução atual). */
const INACTIVE = 'unactive';

/**
 * @param {() => { id: string, topic: string } | null} getActiveSession sessão em andamento
 */
export function createTranslatorModal(getActiveSession) {
  const modal = byId('translator-modal');
  const openButton = byId('open-translator-btn');
  const closeButton = byId('close-translator-btn');
  const sourceInput = byId('normal-text');
  const resultInput = byId('translated-text');
  const translateButton = byId('translate-btn');
  const saveButton = byId('add-flashcards-btn');
  sourceInput.maxLength = TRANSLATOR_MAX_LENGTH;

  let translation = null;
  let saving = false;

  function renderControls() {
    translateButton.disabled = Boolean(translation?.pending);
    const enabled = Boolean(translation?.back) && !saving;
    saveButton.disabled = !enabled;
    saveButton.classList.toggle(INACTIVE, !enabled);
    saveButton.setAttribute('aria-disabled', String(!enabled));
  }

  function clearTranslation() {
    translation = null;
    resultInput.value = '';
    renderControls();
  }

  function open() {
    modal.classList.remove('hidden');
    sourceInput.value = '';
    clearTranslation();
    sourceInput.focus();
  }

  function close() {
    modal.classList.add('hidden');
    clearTranslation();
  }

  async function translate() {
    if (translateButton.disabled) return;
    const text = sourceInput.value.trim();
    if (!text) {
      sourceInput.focus();
      return;
    }
    const request = { sessionId: getActiveSession()?.id, front: text, back: '', pending: true };
    translation = request;
    renderControls();
    resultInput.value = 'Traduzindo...';
    try {
      const back = await translateText(text);
      if (translation !== request) return;
      if (getActiveSession()?.id !== request.sessionId) {
        clearTranslation();
        return;
      }
      request.back = back;
      resultInput.value = back;
    } catch (error) {
      if (translation !== request) return;
      console.error('Erro no tradutor:', error);
      resultInput.value = 'Erro ao traduzir';
      showToast('Falha na conexão do tradutor.', 'error');
    } finally {
      if (translation === request) {
        request.pending = false;
        renderControls();
      }
    }
  }

  async function saveFlashcard() {
    const session = getActiveSession();
    if (!session) {
      showToast('Nenhuma sessão ativa.', 'error');
      return;
    }
    const pair = translation;
    if (saveButton.disabled || pair?.sessionId !== session.id || pair.front !== sourceInput.value.trim()) return;

    saving = true;
    const restore = setBusy(saveButton, 'Salvando...');
    try {
      const { front, back } = pair;
      await addFlashcard(session.id, { front, back, topic: session.topic });
      showToast(`Card "${front}" adicionado aos Flashcards!`, 'success');
      if (translation === pair) close();
    } catch (error) {
      console.error('Erro ao salvar card:', error);
      showToast('Erro ao salvar no banco.', 'error');
    } finally {
      restore();
      saving = false;
      renderControls();
    }
  }

  openButton.addEventListener('click', (event) => {
    event.stopPropagation();
    open();
  });
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    close();
  });
  modal.addEventListener('click', (event) => {
    if (!event.target.closest('.modal')) close();
  });
  translateButton.addEventListener('click', (event) => {
    event.stopPropagation();
    translate();
  });
  sourceInput.addEventListener('input', clearTranslation);
  sourceInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.repeat && !event.isComposing) translate();
  });
  saveButton.addEventListener('click', (event) => {
    event.stopPropagation();
    saveFlashcard();
  });

  renderControls();
  return { close, isOpen: () => !modal.classList.contains('hidden') };
}
