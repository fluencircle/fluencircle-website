import {
    ref,
    get,
    set,
    remove,
    push,
    update
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { database } from "./firebase.js";
import { showToast } from "./auth.js";

// Elementos da Visão
const meetingsListView = document.getElementById('meetings-list-view');
const flashcardsEditorView = document.getElementById('flashcards-editor-view');
const manageMeetingsGrid = document.getElementById('manage-meetings-grid');
const backToMeetingsBtn = document.getElementById('back-to-meetings-list-btn');
const selectedMeetingTitle = document.getElementById('selected-meeting-title');
const cardsEditorContainer = document.getElementById('cards-editor-container');

// Inputs para Adicionar Card Manualmente na Sessão
const newCardFront = document.getElementById('new-card-front');
const newCardBack = document.getElementById('new-card-back');
const addNewCardBtn = document.getElementById('add-new-card-btn');

// Modal de Exclusão
const deleteModal = document.getElementById('delete-confirm-modal');
const deleteModalTitle = document.getElementById('delete-modal-title');
const deleteModalMsg = document.getElementById('delete-modal-msg');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// Botão de Excluir Sessão (dentro da tela de configuração da sessão)
let deleteSessionBtn = document.getElementById('delete-session-btn');

let currentSessionId = null;
let currentSessionData = null;
let currentSessionCards = {};
let itemToDeleteCallback = null;

/**
 * 1. GUARD: Apenas Mediadores e Admins
 */
const currentRole = sessionStorage.getItem('fluentech_user_role');
if (currentRole && currentRole !== 'mediator' && currentRole !== 'admin') {
  showToast('Acesso restrito a Mediadores.', 'error');
  setTimeout(() => { window.location.href = 'index.html'; }, 800);
}

/**
 * Formata data ISO para formato legível (Ex: 21/09/2026 às 15:30)
 */
function formatDate(isoString) {
  if (!isoString) return 'Data não informada';
  const date = new Date(isoString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * 2. Carrega as Sessões de Reunião Realizadas (`meeting_sessions`)
 *    - Elimina os botões de ação do card.
 *    - O clique no próprio card abre as configurações da sessão (mesma lógica com os temas).
 */
async function loadMeetingSessions() {
  if (!manageMeetingsGrid) return;
  manageMeetingsGrid.innerHTML = '<p class="empty-state">Carregando histórico de sessões...</p>';

  try {
    const [sessionsSnap, allCardsSnap] = await Promise.all([
      get(ref(database, 'meeting_sessions')),
      get(ref(database, 'flashcards'))
    ]);

    if (!sessionsSnap.exists()) {
      manageMeetingsGrid.innerHTML = '<p class="empty-state">Nenhuma reunião foi iniciada ainda.</p>';
      return;
    }

    const sessionsObj = sessionsSnap.val();
    const allCardsObj = allCardsSnap.exists() ? allCardsSnap.val() : {};

    manageMeetingsGrid.innerHTML = '';

    // Ordena da reunião mais recente para a mais antiga
    const sessionKeys = Object.keys(sessionsObj).sort((a, b) => {
      const dateA = new Date(sessionsObj[a].startedAt || 0);
      const dateB = new Date(sessionsObj[b].startedAt || 0);
      return dateB - dateA;
    });

    sessionKeys.forEach((sessionId, index) => {
      const session = sessionsObj[sessionId];
      if (!session) return;

      const sessionCards = allCardsObj[sessionId] || {};
      const cardCount = Object.keys(sessionCards).length;

      const card = document.createElement('div');
      card.className = 'manage-meeting-card';
      card.style.cursor = 'pointer';
      card.title = 'Clique para abrir a configuração desta sessão';
      card.innerHTML = `
        <div class="manage-meeting-header">
            <span class="meeting-badge">${sessionKeys.length - index}</span>
            <div>
              <span class="manage-meeting-topic">${session.topic || 'Sessão sem tema'}</span>
              <div style="font-size: 0.75rem; color: #8fa0b5; margin-top: 3px;">
                <i class="fa-regular fa-clock"></i> ${formatDate(session.startedAt)}
              </div>
            </div>
        </div>
        <div class="manage-meeting-info">
            <span><i class="fa-solid fa-layer-group"></i> ${cardCount} flashcard(s) gerados</span>
            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 4px;">
              Mediador: ${session.mediatorEmail || 'Não identificado'}
            </div>
        </div>
      `;

      // Ao clicar no card, abre a configuração da sessão
      card.addEventListener('click', () => {
        openSessionCardsEditor(sessionId, session);
      });

      manageMeetingsGrid.appendChild(card);
    });

  } catch (err) {
    console.error("Erro ao carregar sessões:", err);
    manageMeetingsGrid.innerHTML = '<p class="empty-state">Erro ao carregar dados do servidor.</p>';
  }
}

/**
 * 3. Garante a existência e o comportamento do botão "Excluir Sessão" dentro da tela de configuração
 */
function setupDeleteSessionOption() {
  deleteSessionBtn = document.getElementById('delete-session-btn');
  
  if (!deleteSessionBtn && flashcardsEditorView) {
    deleteSessionBtn = document.createElement('button');
    deleteSessionBtn.id = 'delete-session-btn';
    deleteSessionBtn.className = 'delete-session-btn';
    deleteSessionBtn.classList.add('back-button')
    deleteSessionBtn.innerHTML = '<i class="fa-solid fa-trash"></i> <span>Excluir Sessão</span>';

    const editorContent = document.querySelector('#flashcards-editor-view') || flashcardsEditorView.firstElementChild;
    if (editorContent) {
      editorContent.appendChild(deleteSessionBtn);
    }
  }

  if (deleteSessionBtn) {
    deleteSessionBtn.onclick = () => {
      requestDelete(
        'Excluir Sessão',
        `Tem certeza que deseja apagar a sessão "${currentSessionData?.topic || 'Sem tema'}" realizada em ${formatDate(currentSessionData?.startedAt)}? Isso removerá os flashcards e o histórico desta sessão.`,
        async () => {
          try {
            await Promise.all([
              remove(ref(database, `meeting_sessions/${currentSessionId}`)),
              remove(ref(database, `flashcards/${currentSessionId}`))
            ]);
            showToast('Sessão e cartões excluídos com sucesso.', 'success');
            flashcardsEditorView.classList.add('hidden');
            meetingsListView.classList.remove('hidden');
            loadMeetingSessions();
          } catch (err) {
            console.error("Erro ao excluir sessão:", err);
            showToast('Falha ao excluir sessão.', 'error');
          }
        }
      );
    };
  }
}

/**
 * 4. Abre a Configuração da Sessão Selecionada
 */
async function openSessionCardsEditor(sessionId, sessionData) {
  currentSessionId = sessionId;
  currentSessionData = sessionData;

  if (selectedMeetingTitle) {
    selectedMeetingTitle.textContent = `${sessionData.topic || 'Sessão'} (${formatDate(sessionData.startedAt)})`;
  }
  
  setupDeleteSessionOption();

  meetingsListView.classList.add('hidden');
  flashcardsEditorView.classList.remove('hidden');

  await fetchAndRenderSessionCards();
}

/**
 * 5. Busca em flashcards/{sessionId} e renderiza
 */
async function fetchAndRenderSessionCards() {
  if (!cardsEditorContainer) return;
  cardsEditorContainer.innerHTML = '<p class="empty-state">Carregando flashcards da sessão...</p>';

  try {
    const snapshot = await get(ref(database, `flashcards/${currentSessionId}`));
    currentSessionCards = snapshot.exists() ? snapshot.val() : {};

    cardsEditorContainer.innerHTML = '';
    const cardIds = Object.keys(currentSessionCards);

    if (cardIds.length === 0) {
      cardsEditorContainer.innerHTML = '<p class="empty-state">Nenhum flashcard foi salvo durante esta sessão. Adicione um acima se desejar!</p>';
      return;
    }

    cardIds.forEach((cardId, index) => {
      const item = currentSessionCards[cardId];
      if (!item) return;

      const row = document.createElement('div');
      row.className = 'card-editor-row';
      row.innerHTML = `
        <span class="card-row-index">${index + 1}</span>
        <div class="card-inputs-group">
            <input type="text" class="card-edit-front" value="${item.front || ''}" placeholder="Frente (Inglês)">
            <input type="text" class="card-edit-back" value="${item.back || ''}" placeholder="Verso (Português)">
        </div>
        <div class="card-row-actions">
            <button class="save-single-card-btn" title="Salvar alteração neste card">
                <i class="fa-solid fa-floppy-disk"></i> 
            </button>
            <button class="delete-single-card-btn" title="Excluir este card">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
      `;

      const frontInput = row.querySelector('.card-edit-front');
      const backInput = row.querySelector('.card-edit-back');
      const saveBtn = row.querySelector('.save-single-card-btn');
      const deleteBtn = row.querySelector('.delete-single-card-btn');

      // Salvar alteração no card específico
      saveBtn.addEventListener('click', async () => {
        const newFront = frontInput.value.trim();
        const newBack = backInput.value.trim();

        if (!newFront || !newBack) {
          showToast('Preencha os dois lados do flashcard.', 'error');
          return;
        }

        try {
          saveBtn.disabled = true;
          await update(ref(database, `flashcards/${currentSessionId}/${cardId}`), {
            front: newFront,
            back: newBack
          });

          currentSessionCards[cardId].front = newFront;
          currentSessionCards[cardId].back = newBack;
          showToast('Card atualizado com sucesso!', 'success');
        } catch (err) {
          console.error("Erro ao atualizar card:", err);
          showToast('Falha ao salvar alteração.', 'error');
        } finally {
          saveBtn.disabled = false;
        }
      });

      // Excluir card individual
      deleteBtn.addEventListener('click', () => {
        requestDelete(
          'Excluir Flashcard',
          `Deseja remover o card "${item.front}" desta sessão?`,
          async () => {
            await remove(ref(database, `flashcards/${currentSessionId}/${cardId}`));
            delete currentSessionCards[cardId];
            showToast('Flashcard removido.', 'success');
            fetchAndRenderSessionCards();
          }
        );
      });

      cardsEditorContainer.appendChild(row);
    });

  } catch (err) {
    console.error("Erro ao buscar flashcards:", err);
    cardsEditorContainer.innerHTML = '<p class="empty-state">Erro ao carregar flashcards.</p>';
  }
}

/**
 * 6. Adicionar Flashcard Manualmente à Sessão
 */
if (addNewCardBtn) {
  addNewCardBtn.addEventListener('click', async () => {
    const front = newCardFront.value.trim();
    const back = newCardBack.value.trim();

    if (!front || !back) {
      showToast('Informe os dados de frente e verso.', 'error');
      return;
    }

    addNewCardBtn.disabled = true;
    try {
      const cardRef = push(ref(database, `flashcards/${currentSessionId}`));
      const newCardData = {
        front,
        back,
        topic: currentSessionData?.topic || '',
        sessionId: currentSessionId,
        createdAt: new Date().toISOString()
      };

      await set(cardRef, newCardData);
      newCardFront.value = '';
      newCardBack.value = '';
      showToast('Flashcard adicionado à sessão!', 'success');
      await fetchAndRenderSessionCards();

    } catch (err) {
      console.error("Erro ao adicionar card na sessão:", err);
      showToast('Erro ao gravar card.', 'error');
    } finally {
      addNewCardBtn.disabled = false;
    }
  });
}

/**
 * 7. Voltar para a Lista de Sessões
 */
if (backToMeetingsBtn) {
  backToMeetingsBtn.addEventListener('click', () => {
    flashcardsEditorView.classList.add('hidden');
    meetingsListView.classList.remove('hidden');
    loadMeetingSessions();
  });
}

/**
 * 8. Modal de Exclusão Genérico
 */
function requestDelete(title, msg, onConfirm) {
  if (!deleteModal) return;
  deleteModalTitle.textContent = title;
  deleteModalMsg.textContent = msg;
  itemToDeleteCallback = onConfirm;
  deleteModal.classList.remove('hidden');
}

if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    itemToDeleteCallback = null;
  });
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', async () => {
    deleteModal.classList.add('hidden');
    if (typeof itemToDeleteCallback === 'function') {
      await itemToDeleteCallback();
      itemToDeleteCallback = null;
    }
  });
}

// Inicialização
loadMeetingSessions();