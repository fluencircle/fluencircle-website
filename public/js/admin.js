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
  
  // Modal Exclusão
  const deleteModal = document.getElementById('delete-user-modal');
  const deleteMsg = document.getElementById('delete-user-msg');
  const cancelDeleteBtn = document.getElementById('cancel-delete-user-btn');
  const confirmDeleteBtn = document.getElementById('confirm-delete-user-btn');
  
  let userToDeleteUid = null;
  let allUsersCache = {};
  
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
   * 2. Carrega todos os perfis do Realtime Database (/users)
   */
  async function loadUsers() {
    usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: #8fa0b5;">Carregando perfis...</td></tr>`;
  
    try {
      const snapshot = await get(ref(database, 'users'));
      if (!snapshot.exists()) {
        usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px;">Nenhum usuário cadastrado.</td></tr>`;
        return;
      }
  
      allUsersCache = snapshot.val();
      usersTableBody.innerHTML = '';
  
      const uids = Object.keys(allUsersCache);
  
      uids.forEach(uid => {
        const user = allUsersCache[uid];
        if (!user) return;
  
        const fullName = (user.firstName && user.lastName) 
          ? `${user.firstName} ${user.lastName}` 
          : (user.email ? user.email.split('@')[0] : 'Usuário Sem Nome');
  
        const roleLabels = {
          'admin': 'Administrador',
          'mediator': 'Mediador',
          'student': 'Aluno'
        };
  
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
            <span  badge-${user.role || 'student'}">
              ${roleLabels[user.role] || 'Aluno'}
            </span>
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
  
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
      usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ff5252;">Erro ao carregar banco de dados.</td></tr>`;
    }
  }
  
  /**
   * 3. Modal: Abrir para Criação
   */
  openCreateModalBtn.addEventListener('click', () => {
    userForm.reset();
    editUserUidInput.value = '';
    userModalTitle.textContent = 'Novo Perfil';
    emailInput.disabled = false;
    passwordContainer.classList.remove('hidden');
    passwordInput.required = true;
    userFormModal.classList.remove('hidden');
  });
  
  /**
   * 4. Modal: Abrir para Edição
   */
  function openEditModal(uid, user) {
    userForm.reset();
    editUserUidInput.value = uid;
    userModalTitle.textContent = 'Modificar Perfil';
    
    firstNameInput.value = user.firstName || '';
    lastNameInput.value = user.lastName || '';
    emailInput.value = user.email || '';
    emailInput.disabled = true; // No Firebase Auth a alteração de e-mail requer reautenticação
    roleSelect.value = user.role || 'student';
  
    // Na edição de permissão/dados não obrigamos a trocar a senha
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
   * 5. Salvar / Atualizar Perfil
   */
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
  
    const isEditing = !!editUserUidInput.value;
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;
    const email = emailInput.value.trim();
  
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
          updatedAt: new Date().toISOString()
        });
  
        // Se o usuário editado for o próprio admin atual, atualiza a sessão imediatamente
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
  
        // Cria a conta no Firebase Auth usando a Secondary App (para não deslogar o Admin)
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUid = userCredential.user.uid;
  
        // Desconecta a conta secundária recém-criada
        await signOut(secondaryAuth);
  
        // Salva no Realtime Database (/users/{uid})
        await set(ref(database, `users/${newUid}`), {
          firstName,
          lastName,
          email,
          role,
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
   * 6. Exclusão de Perfil
   */
  function openDeleteModal(uid, name) {
    // Impede o admin de deletar a própria conta logada
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
      // 1. Remove do nó de usuários ativos
      await remove(ref(database, `users/${userToDeleteUid}`));
  
      // 2. Marca o UID na lista negra de revogação imediata
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
  
  // Inicialização
  loadUsers();