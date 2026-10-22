import {
    ref,
    get,
    set,
    update,
    remove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { database, auth } from "./firebase.js";
import { showToast } from "./auth.js";

// Configuração do Firebase para criar contas sem deslogar o Admin atual
const firebaseConfig = {
    apiKey: "AIzaSyAG6PEwWQADPAs5RjwzqbrO0DRBXVIv7G0",
    authDomain: "fluentech-1e18a.firebaseapp.com",
    databaseURL: "https://fluentech-1e18a-default-rtdb.firebaseio.com",
    projectId: "fluentech-1e18a",
    storageBucket: "fluentech-1e18a.firebasestorage.app",
    messagingSenderId: "429228883820",
    appId: "1:429228883820:web:2c71b892fb57c23f05bd49"
};

// Instância secundária isolada
const secondaryApp = initializeApp(firebaseConfig, "SecondaryRegistrationApp");
const secondaryAuth = getAuth(secondaryApp);

// Elementos da Página
const usersTableBody = document.getElementById('users-table-body');
const openCreateModalBtn = document.getElementById('open-create-user-modal-btn');
const userFormModal = document.getElementById('user-form-modal');
const closeUserModalBtn = document.getElementById('close-user-modal-btn');
const cancelUserModalBtn = document.getElementById('cancel-user-modal-btn');
const userForm = document.getElementById('user-form');
const userModalTitle = document.getElementById('user-modal-title');
const editUserUidInput = document.getElementById('edit-user-uid');
const firstNameInput = document.getElementById('user-firstname');
const lastNameInput = document.getElementById('user-lastname');
const emailInput = document.getElementById('user-email-input');
const passwordInput = document.getElementById('user-password-input');
const passwordContainer = document.getElementById('password-field-container');
const roleSelect = document.getElementById('user-role-select');
const planSelect = document.getElementById('user-plan-select');
const adminSearchBar = document.getElementById('admin-search-bar');

// Modal Exclusão
const deleteModal = document.getElementById('delete-user-modal');
const deleteMsg = document.getElementById('delete-user-msg');
const cancelDeleteBtn = document.getElementById('cancel-delete-user-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-user-btn');

let userToDeleteUid = null;
let allUsersCache = {};
let allPlansCache = {}; // Cache dos planos vindos de /plans

/**
 * 1. GUARD: Proteção da Página (Apenas Admin)
 */
const currentRole = sessionStorage.getItem('fluentech_user_role');
if (currentRole && currentRole !== 'admin') {
    showToast('Acesso negado. Página restrita a Administradores.', 'error');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

/**
 * 2. Carrega todos os planos salvos no banco (/plans)
 */
async function loadPlans() {
    try {
        const snap = await get(ref(database, 'plans'));
        allPlansCache = snap.exists() ? snap.val() : {};
        populatePlanSelectOptions();
    } catch (err) {
        console.error("Erro ao carregar planos:", err);
    }
}

// Popula o <select> de planos do modal
function populatePlanSelectOptions() {
    if (!planSelect) return;
    planSelect.innerHTML = '<option value="">Sem plano vinculado</option>';

    Object.keys(allPlansCache).forEach(planId => {
        const plan = allPlansCache[planId];
        const opt = document.createElement('option');
        opt.value = planId;
        const price = parseFloat(plan.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
        opt.textContent = `${plan.name} (R$ ${price}/mês)`;
        planSelect.appendChild(opt);
    });
}

/**
 * 3. Carrega e renderiza os perfis do Realtime Database (/users)
 */
let currentAdminSearchTerm = '';

if (adminSearchBar) {
    adminSearchBar.addEventListener('input', (e) => {
        currentAdminSearchTerm = e.target.value;
        renderUsersTable(currentAdminSearchTerm);
    });
}

async function loadUsers() {
    usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: #8fa0b5;">Carregando perfis...</td></tr>`;

    try {
        const snapshot = await get(ref(database, 'users'));
        if (!snapshot.exists()) {
            usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px;">Nenhum usuário cadastrado.</td></tr>`;
            return;
        }

        allUsersCache = snapshot.val();
        renderUsersTable(currentAdminSearchTerm);

    } catch (err) {
        console.error("Erro ao carregar usuários:", err);
        usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ff5252;">Erro ao carregar banco de dados.</td></tr>`;
    }
}

// Função auxiliar para renderizar a tabela aplicando ordenação e filtro
function renderUsersTable(searchTerm = '') {
    if (!allUsersCache) return;

    usersTableBody.innerHTML = '';

    // 1. Converte o objeto do Firebase em um array
    const usersArray = Object.keys(allUsersCache).map(uid => ({
        uid,
        ...allUsersCache[uid]
    }));

    // 2. Ordena em ordem alfabética pelo nome completo
    usersArray.sort((a, b) => {
        const nameA = (a.firstName && a.lastName) ? `${a.firstName} ${a.lastName}` : (a.email ? a.email.split('@')[0] : '');
        const nameB = (b.firstName && b.lastName) ? `${b.firstName} ${b.lastName}` : (b.email ? b.email.split('@')[0] : '');
        return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'accent' });
    });

    // 3. Normaliza o termo de busca
    const term = searchTerm.toLowerCase().trim();

    // 4. Filtra por nome, e-mail ou nome do plano
    const filteredUsers = usersArray.filter(user => {
        const fullName = (user.firstName && user.lastName) 
            ? `${user.firstName} ${user.lastName}` 
            : (user.email ? user.email.split('@')[0] : 'Usuário Sem Nome');
        
        const email = user.email || '';
        const userPlanId = user.planId || user.plan || '';
        const userPlanObj = allPlansCache[userPlanId];
        const planName = userPlanObj ? userPlanObj.name : (user.planName || '');

        return fullName.toLowerCase().includes(term) || 
               email.toLowerCase().includes(term) || 
               planName.toLowerCase().includes(term);
    });

    if (filteredUsers.length === 0) {
        usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: #8fa0b5;">Nenhum usuário encontrado.</td></tr>`;
        return;
    }

    // 5. Renderiza cada linha da tabela
    filteredUsers.forEach(user => {
        const uid = user.uid;
        const fullName = (user.firstName && user.lastName) 
            ? `${user.firstName} ${user.lastName}` 
            : (user.email ? user.email.split('@')[0] : 'Usuário Sem Nome');

        const roleLabels = {
            'admin': 'Administrador',
            'mediator': 'Mediador',
            'student': 'Aluno'
        };

        // Identifica o Plano do Usuário baseado nos planos do banco
        const userPlanId = user.planId || user.plan || '';
        const userPlanObj = allPlansCache[userPlanId];
        const planDisplayName = userPlanObj 
            ? userPlanObj.name 
            : (user.planName || 'Sem plano');

        const planBadgeHtml = userPlanId && (userPlanObj || user.planName)
            ? `<span class="badge-plan"><i class="fa-solid fa-gem"></i> ${planDisplayName}</span>`
            : `<span class="badge-no-plan">Sem plano</span>`;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 600;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="user-avatar">${fullName.charAt(0).toUpperCase()}</div>
                    <span>${fullName}</span>
                </div>
            </td>
            <td>${user.email || '—'}</td>
            <td style="font-family: monospace; font-size: 0.8rem; color: #8fa0b5;" title="${uid}">
                ${uid.length > 14 ? uid.substring(0, 14) + '...' : uid}
            </td>
            <td>
                <span class="badge-${user.role || 'student'}">
                    ${roleLabels[user.role] || 'Aluno'}
                </span>
            </td>
            <td>
                ${planBadgeHtml}
            </td>
            <td style="text-align: right;">
                <button class="action-table-btn edit-btn" title="Editar Perfil">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="action-table-btn delete-btn" title="Excluir Perfil">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;

        // Ação Editar
        row.querySelector('.edit-btn').addEventListener('click', () => {
            openEditModal(uid, user);
        });

        // Ação Excluir
        row.querySelector('.delete-btn').addEventListener('click', () => {
            openDeleteModal(uid, fullName);
        });

        usersTableBody.appendChild(row);
    });
}

/**
 * 4. Modal: Abrir para Criação
 */
openCreateModalBtn.addEventListener('click', () => {
    userForm.reset();
    editUserUidInput.value = '';
    userModalTitle.textContent = 'Novo Perfil';
    emailInput.disabled = false;
    passwordContainer.classList.remove('hidden');
    passwordInput.required = true;
    if (planSelect) planSelect.value = '';
    userFormModal.classList.remove('hidden');
});

/**
 * 5. Modal: Abrir para Edição
 */
function openEditModal(uid, user) {
    userForm.reset();
    editUserUidInput.value = uid;
    userModalTitle.textContent = 'Modificar Perfil';
    
    firstNameInput.value = user.firstName || '';
    lastNameInput.value = user.lastName || '';
    emailInput.value = user.email || '';
    emailInput.disabled = true; // No Firebase Auth alteração de e-mail requer reautenticação
    roleSelect.value = user.role || 'student';

    // Seleciona o plano atual do usuário no dropdown
    if (planSelect) {
        planSelect.value = user.planId || user.plan || '';
    }

    passwordContainer.classList.add('hidden');
    passwordInput.required = false;

    userFormModal.classList.remove('hidden');
}

function closeUserModal() {
    userFormModal.classList.add('hidden');
}
closeUserModalBtn.addEventListener('click', closeUserModal);
cancelUserModalBtn.addEventListener('click', closeUserModal);

/**
 * 6. Salvar / Atualizar Perfil (com Plano)
 */
userForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isEditing = !!editUserUidInput.value;
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;
    const email = emailInput.value.trim();
    const selectedPlanId = planSelect ? planSelect.value : '';
    const selectedPlanObj = allPlansCache[selectedPlanId];
    const planName = selectedPlanObj ? selectedPlanObj.name : '';

    const submitBtn = document.getElementById('save-user-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando...';

    try {
        if (isEditing) {
            // ATUALIZAR PERFIL EXISTENTE
            const uid = editUserUidInput.value;
            await update(ref(database, `users/${uid}`), {
                firstName,
                lastName,
                role,
                planId: selectedPlanId,
                planName: planName,
                updatedAt: new Date().toISOString()
            });

            if (auth.currentUser && auth.currentUser.uid === uid) {
                sessionStorage.setItem('fluentech_user_role', role);
            }

            showToast('Perfil atualizado com sucesso!', 'success');
            closeUserModal();
            loadUsers();

        } else {
            // CRIAR NOVO PERFIL
            const password = passwordInput.value;
            if (!password || password.length < 6) {
                showToast('A senha deve ter no mínimo 6 caracteres.', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Salvar Perfil';
                return;
            }

            // Cria a conta no Firebase Auth via app secundária
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUid = userCredential.user.uid;

            await signOut(secondaryAuth);

            // Salva no Realtime Database (/users/{uid}) com o plano
            await set(ref(database, `users/${newUid}`), {
                firstName,
                lastName,
                email,
                role,
                planId: selectedPlanId,
                planName: planName,
                createdAt: new Date().toISOString()
            });

            showToast(`Perfil de ${firstName} criado com sucesso!`, 'success');
            closeUserModal();
            loadUsers();
        }

    } catch (err) {
        console.error("Erro ao salvar usuário:", err);
        if (err.code === 'auth/email-already-in-use') {
            showToast('Este e-mail já está cadastrado no sistema.', 'error');
        } else {
            showToast('Erro ao processar requisição: ' + err.message, 'error');
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar Perfil';
    }
});

/**
 * 7. Exclusão de Perfil
 */
function openDeleteModal(uid, name) {
    if (auth.currentUser && auth.currentUser.uid === uid) {
        showToast('Você não pode excluir sua própria conta de administrador.', 'error');
        return;
    }

    userToDeleteUid = uid;
    deleteMsg.textContent = `Tem certeza de que deseja excluir o perfil de ${name}? O usuário perderá acesso imediato.`;
    deleteModal.classList.remove('hidden');
}

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    userToDeleteUid = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!userToDeleteUid) return;

    deleteModal.classList.add('hidden');
    try {
        await remove(ref(database, `users/${userToDeleteUid}`));

        await set(ref(database, `deleted_users/${userToDeleteUid}`), {
            deletedAt: new Date().toISOString(),
            deletedBy: auth.currentUser ? auth.currentUser.email : 'admin'
        });

        showToast('Perfil excluído e acesso permanentemente bloqueado!', 'success');
        loadUsers();
    } catch (err) {
        console.error("Erro ao excluir perfil:", err);
        showToast('Erro ao remover usuário.', 'error');
    } finally {
        userToDeleteUid = null;
    }
});

/**
 * 8. Inicialização: carrega primeiro os planos e depois os usuários
 */
async function init() {
    await loadPlans();
    await loadUsers();
}

init();