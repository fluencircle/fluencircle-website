import {
    ref,
    get,
    set,
    push,
    update,
    remove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { database } from "./firebase.js";
import { showToast } from "./auth.js";

// Elementos da Interface
const themesListView = document.getElementById('themes-list-view');
const themeEditorView = document.getElementById('theme-editor-view');
const themesGrid = document.getElementById('themes-grid');
const openCreateThemeBtn = document.getElementById('open-create-theme-btn');
const backToThemesBtn = document.getElementById('back-to-themes-btn');
const cancelThemeBtn = document.getElementById('cancel-theme-btn');

// Elementos do Editor
const editorTitle = document.getElementById('editor-title');
const editorSubtitle = document.getElementById('editor-subtitle');
const topicInput = document.getElementById('topic-input');
const questionListElement = document.getElementById('questions-list');
const addQuestionBtn = document.getElementById('add-question-button');
const saveThemeBtn = document.getElementById('set-button');

// Modal de Exclusão
const deleteModal = document.getElementById('delete-theme-modal');
const deleteMsg = document.getElementById('delete-theme-msg');
const cancelDeleteBtn = document.getElementById('cancel-delete-theme-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-theme-btn');

let currentEditingKey = null; // null = novo tema | string = id do tema sendo editado
let themeToDeleteKey = null;

/**
 * 1. GUARD: Apenas Mediadores e Administradores
 */
const currentRole = sessionStorage.getItem('fluentech_user_role');
if (currentRole && currentRole !== 'mediator' && currentRole !== 'admin') {
    showToast('Acesso restrito a Mediadores.', 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
}

/**
 * 2. Carrega todos os temas de /meetings
 */
async function loadThemes() {
    themesGrid.innerHTML = '<p class="empty-state">Carregando temas...</p>';

    try {
        const snapshot = await get(ref(database, 'meetings'));
        if (!snapshot.exists()) {
            themesGrid.innerHTML = '<p class="empty-state">Nenhum tema de conversação cadastrado ainda.</p>';
            return;
        }

        const themesObj = snapshot.val();
        themesGrid.innerHTML = '';

        const keys = Object.keys(themesObj);

        keys.forEach((key, index) => {
            const meeting = themesObj[key];
            if (!meeting) return;

            let questionsCount = 0;
            if (Array.isArray(meeting.questions)) {
                questionsCount = meeting.questions.length;
            } else if (meeting.questions && typeof meeting.questions === 'object') {
                questionsCount = Object.keys(meeting.questions).length;
            }

            const card = document.createElement('div');
            card.className = 'manage-meeting-card';
            card.innerHTML = `
                <div class="manage-meeting-header">
                    <span class="meeting-badge">${index + 1}</span>
                    <span class="manage-meeting-topic">${meeting.topic || 'Sem tema'}</span>
                </div>
                <div class="manage-meeting-info">
                    <span><i class="fa-solid fa-circle-question"></i> ${questionsCount} pergunta(s)</span>
                </div>
                <div class="manage-meeting-actions">
                    <button class="action-btn edit-theme-btn" title="Editar Tópico e Perguntas">
                        <i class="fa-solid fa-pen-to-square"></i> Editar
                    </button>
                    <button class="action-btn delete-meeting-btn" title="Excluir este tema">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;

            // Botão Editar
            card.querySelector('.edit-theme-btn').addEventListener('click', () => {
                openEditor(key, meeting);
            });

            // Botão Excluir
            card.querySelector('.delete-meeting-btn').addEventListener('click', () => {
                openDeleteModal(key, meeting.topic || 'este tema');
            });

            themesGrid.appendChild(card);
        });

    } catch (err) {
        console.error("Erro ao buscar temas:", err);
        themesGrid.innerHTML = '<p class="empty-state">Erro ao carregar banco de dados.</p>';
    }
}

/**
 * 3. Abertura do Modo de Criação / Edição
 */
openCreateThemeBtn.addEventListener('click', () => {
    openEditor(null);
});

function openEditor(key = null, data = null) {
    currentEditingKey = key;
    questionListElement.innerHTML = '';

    if (key && data) {
        // MODO EDIÇÃO
        editorTitle.textContent = 'Editar Tema';
        editorSubtitle.textContent = 'Modifique o título ou adicione/remova perguntas de apoio.';
        topicInput.value = data.topic || '';

        // Carrega perguntas existentes
        let questions = [];
        if (Array.isArray(data.questions)) {
            questions = data.questions;
        } else if (data.questions && typeof data.questions === 'object') {
            questions = Object.values(data.questions);
        }

        questions.forEach(q => addQuestionCard(q));
    } else {
        // MODO NOVO TEMA
        editorTitle.textContent = 'Novo Tema';
        editorSubtitle.textContent = 'Defina o título do tópico e insira as perguntas condutoras.';
        topicInput.value = '';
        // Inicia com um campo de pergunta vazio pronto para digitar
        addQuestionCard();
    }

    themesListView.classList.add('hidden');
    themeEditorView.classList.remove('hidden');
    topicInput.focus();
}

function closeEditor() {
    themeEditorView.classList.add('hidden');
    themesListView.classList.remove('hidden');
    loadThemes();
}

backToThemesBtn.addEventListener('click', closeEditor);
cancelThemeBtn.addEventListener('click', closeEditor);

/**
 * 4. Manipulação de Cards de Pergunta Dinâmicos
 */
addQuestionBtn.addEventListener('click', () => {
    addQuestionCard();
});

function addQuestionCard(initialText = '') {
    const card = document.createElement('div');
    card.classList.add('question-card');
    card.innerHTML = `
        <span class="questionNumber">0</span>
        <input type="text" class="new-question-input" placeholder="Digite sua pergunta em inglês..." value="${initialText}">
        <button type="button" class="delete-question-btn" title="Remover pergunta"><i class="fa-solid fa-trash"></i></button>
    `;

    const input = card.querySelector('.new-question-input');
    const deleteBtn = card.querySelector('.delete-question-btn');

    deleteBtn.addEventListener('click', () => {
        card.remove();
        renumberQuestions();
    });

    questionListElement.appendChild(card);
    renumberQuestions();
    if (!initialText) input.focus();
}

function renumberQuestions() {
    questionListElement.querySelectorAll('.question-card').forEach((card, i) => {
        card.querySelector('.questionNumber').textContent = i + 1;
    });
}

/**
 * 5. Salvar Tema (Criação com push ou Atualização com update)
 */
saveThemeBtn.addEventListener('click', async () => {
    const topic = topicInput.value.trim();

    if (!topic) {
        showToast('Adicione o título do tema!', 'error');
        topicInput.classList.add('danger-input');
        setTimeout(() => topicInput.classList.remove('danger-input'), 2000);
        return;
    }

    const inputs = questionListElement.querySelectorAll('.new-question-input');
    const questions = Array.from(inputs)
        .map(input => input.value.trim())
        .filter(Boolean);

    if (questions.length === 0) {
        showToast('Adicione pelo menos 1 pergunta para a conversa!', 'error');
        return;
    }

    saveThemeBtn.disabled = true;
    saveThemeBtn.textContent = 'Salvando...';

    try {
        const payload = {
            topic,
            questions,
            updatedAt: new Date().toISOString()
        };

        if (currentEditingKey) {
            // ATUALIZAR TEMA EXISTENTE
            await update(ref(database, `meetings/${currentEditingKey}`), payload);
            showToast('Tema atualizado com sucesso!', 'success');
        } else {
            // CRIAR NOVO TEMA (Gera chave atômica sem colisão)
            const newMeetingRef = push(ref(database, 'meetings'));
            await set(newMeetingRef, {
                ...payload,
                createdAt: new Date().toISOString()
            });
            showToast('Novo tema criado com sucesso!', 'success');
        }

        closeEditor();

    } catch (err) {
        console.error("Erro ao salvar tema:", err);
        showToast('Falha ao salvar no banco de dados.', 'error');
    } finally {
        saveThemeBtn.disabled = false;
        saveThemeBtn.innerHTML = '<i class="fa-solid fa-floppy-disk" style="margin-right: 8px;"></i> Salvar Tema';
    }
});

/**
 * 6. Exclusão de Tema
 */
function openDeleteModal(key, topicName) {
    themeToDeleteKey = key;
    deleteMsg.textContent = `Tem certeza de que deseja excluir o tema "${topicName}"?`;
    deleteModal.classList.remove('hidden');
}

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    themeToDeleteKey = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!themeToDeleteKey) return;

    deleteModal.classList.add('hidden');
    try {
        await remove(ref(database, `meetings/${themeToDeleteKey}`));
        showToast('Tema excluído com sucesso.', 'success');
        loadThemes();
    } catch (err) {
        console.error("Erro ao excluir tema:", err);
        showToast('Erro ao remover tema.', 'error');
    } finally {
        themeToDeleteKey = null;
    }
});

// Inicialização
loadThemes();