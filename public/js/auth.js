import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  ref,
  get,
  set,
  child
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { auth, database } from "./firebase.js";

const CACHE_ROLE_KEY = 'fluentech_user_role';
const CACHE_EMAIL_KEY = 'fluentech_user_email';

const loadingGif = document.querySelector('.loading-gif');
const submitBtn = document.getElementById('login-btn');

function setLoading(active) {
  if (loadingGif) loadingGif.classList.toggle('hidden', !active);
  if (submitBtn) {
    submitBtn.disabled = active;
    submitBtn.style.opacity = active ? '0.65' : '1';
    submitBtn.style.cursor = active ? 'not-allowed' : 'pointer';
  }
}

export function showToast(message, type = 'success') {
  let toast = document.getElementById('auth-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'auth-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast toast-${type} toast-visible`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('toast-visible'), 3500);
}

const ERROR_MESSAGES = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-password': 'Por favor, insira a senha.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Usuário não cadastrado.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde instantes.',
  'auth/network-request-failed': 'Sem conexão com a internet. Verifique sua rede.'
};

/**
 * Consulta a role no Realtime Database (/users/{uid}/role)
 * Se for o primeiro acesso de um usuário, registra como 'student' por padrão
 */
export async function fetchAndCacheUserRole(user) {
  try {
    const dbRef = ref(database);

    // 1. Checa primeiro se o usuário está na lista negra de excluídos
    const deletedSnap = await get(child(dbRef, `deleted_users/${user.uid}`));
    if (deletedSnap.exists()) {
      await signOut(auth);
      sessionStorage.clear();
      showToast('Esta conta foi excluída pelo administrador.', 'error');
      return null;
    }

    // 2. Checa se o usuário existe na lista de usuários ativos
    const userSnap = await get(child(dbRef, `users/${user.uid}`));
    if (!userSnap.exists()) {
      // Se não existe em /users e tentou logar, é uma conta revogada!
      await signOut(auth);
      sessionStorage.clear();
      showToast('Conta não encontrada ou acesso revogado.', 'error');
      return null;
    }

    const userData = userSnap.val();
    const role = userData.role || 'student';
    sessionStorage.setItem(CACHE_ROLE_KEY, role);
    return role;

  } catch (err) {
    console.error("Erro ao consultar perfil:", err);
    return null;
  }
}

/**
 * Controla a visibilidade dos elementos conforme os 3 níveis de acesso:
 * - student: Vê apenas Flash Cards
 * - mediator: Vê Flash Cards + Criar e Iniciar Reunião
 * - admin: Vê tudo + Gestão de Perfis na barra lateral e na home
 */
export function applyRolePermissions(role) {
  const isMediatorOrAdmin = (role === 'mediator' || role === 'admin');
  const isAdmin = (role === 'admin');

  // Acessos de Reunião (Mediador e Admin)
  document.querySelectorAll('.mediator-access').forEach(el => {
    el.classList.toggle('hidden', !isMediatorOrAdmin);
  });

  // Acesso exclusivo do Administrador (Gestão de Perfis na sidebar e home)
  document.querySelectorAll('.admin-access').forEach(el => {
    el.classList.toggle('hidden', !isAdmin);
  });

  // Badge no cabeçalho indicando a função
  const roleBadge = document.getElementById('user-role-badge');
  if (roleBadge) {
    const labels = {
      'admin': 'Administrador',
      'mediator': 'Mediador',
      'student': 'Aluno'
    };
    roleBadge.textContent = labels[role] || 'Aluno';
    roleBadge.className = `user-role-badge badge-${role || 'student'}`;
    roleBadge.classList.remove('hidden');
  }
}

/**
 * Aplica instantaneamente os acessos se já estiver salvo na sessão (Sem delay visual)
 */
function applyInstantCachedState() {
  const cachedRole = sessionStorage.getItem(CACHE_ROLE_KEY);
  const cachedEmail = sessionStorage.getItem(CACHE_EMAIL_KEY);

  if (cachedEmail) {
    const userEmailEl = document.getElementById('user-email');
    if (userEmailEl) userEmailEl.textContent = cachedEmail;
  }

  if (cachedRole) {
    applyRolePermissions(cachedRole);
  }
}

// Execução imediata no milissegundo zero
applyInstantCachedState();

/**
 * LOGIN: Valida credenciais e busca a role DURANTE o loading antes de redirecionar
 */
export async function signIn(email, password) {
  if (!email.trim() || !password) {
    showToast('Preencha e-mail e senha.', 'error');
    return;
  }

  setLoading(true);

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;

    // Checa a autorização do usuário no banco de dados
    const role = await fetchAndCacheUserRole(user);

    // SE A CONTA FOI EXCLUÍDA / REVOGADA:
    if (!role) {
      setLoading(false);
      // O fetchAndCacheUserRole já executou o signOut e mostrou o toast de erro
      return;
    }

    // Apenas se a role for válida, prossegue para o sistema
    sessionStorage.setItem(CACHE_EMAIL_KEY, user.email);
    window.location.href = 'index.html';

  } catch (error) {
    setLoading(false);
    const msg = ERROR_MESSAGES[error.code] || 'E-mail ou senha incorretos.';
    showToast(msg, 'error');
  }
}

/**
 * LOGOUT: Limpa os dados de sessão e envia para a tela de autenticação
 */
export function logout() {
  setLoading(true);
  sessionStorage.removeItem(CACHE_ROLE_KEY);
  sessionStorage.removeItem(CACHE_EMAIL_KEY);
  signOut(auth).then(() => {
    window.location.href = 'auth.html';
  });
}

/**
 * AUTH GUARD: Monitora estado de autenticação em segundo plano
 */
export function initAuthGuard() {
  const isAuthPage = !!document.getElementById('authHTML');

  onAuthStateChanged(auth, async (user) => {
    if (isAuthPage) {
      if (user) {
        // Se já tem sessão na auth.html, confere se ainda está ativo antes de mandar pra home
        const role = await fetchAndCacheUserRole(user);
        if (role) {
          window.location.href = 'index.html';
        }
      }
      return;
    }

    // Nas páginas internas
    if (!user) {
      sessionStorage.clear();
      window.location.href = 'auth.html';
      return;
    }

    const role = await fetchAndCacheUserRole(user);
    if (!role) {
      // Se foi deletado enquanto usava o sistema, é chutado para a tela de login
      sessionStorage.clear();
      window.location.href = 'auth.html';
      return;
    }

    sessionStorage.setItem(CACHE_EMAIL_KEY, user.email);
    const userEmailEl = document.getElementById('user-email');
    if (userEmailEl) userEmailEl.textContent = user.email;

    applyRolePermissions(role);
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
}

initAuthGuard();




export async function getUserRole() {
  const cachedRole = sessionStorage.getItem(CACHE_ROLE_KEY);
  if (cachedRole) {
    return cachedRole;
  }

  if (auth.currentUser) {
    return await fetchAndCacheUserRole(auth.currentUser);
  }

  return 'student';
}