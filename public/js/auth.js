import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth } from "./firebase.js";

const loadingGif = document.querySelector('.loading-gif');

function setLoading(active) {
  if (loadingGif) {
    loadingGif.classList.toggle('hidden', !active);
  }
}

export function showToast(message, type = 'success') {
  let toast = document.getElementById('auth-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'auth-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast toast-${type} toast-visible`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('toast-visible'), 3500);
}

const ERROR_MESSAGES = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-password': 'Insira uma senha.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
  'auth/user-not-found': 'Usuário não encontrado.',
  'auth/wrong-password': 'Senha incorreta.'
};

export function authErrorTreatment(error) {
  const message = ERROR_MESSAGES[error.code] || 'Ocorreu um erro. Tente novamente.';
  showToast(message, 'error');
}

export function signIn(email, password) {
  if (!email.trim() || !password) {
    showToast('Preencha e-mail e senha.', 'error');
    return;
  }
  setLoading(true);
  signInWithEmailAndPassword(auth, email.trim(), password)
    .then(() => { window.location.href = 'index.html'; })
    .catch((error) => {
      setLoading(false);
      authErrorTreatment(error);
    });
}

export function logout() {
  setLoading(true);
  signOut(auth)
    .then(() => { window.location.href = 'auth.html'; })
    .catch((error) => {
      setLoading(false);
      console.error('Erro ao deslogar:', error);
      showToast('Erro ao sair. Tente novamente.', 'error');
    });
}

export function initAuthGuard() {
  const isAuthPage = document.getElementById('authHTML');

  onAuthStateChanged(auth, (user) => {
    if (isAuthPage) {
      if (user) window.location.href = 'index.html';
      return;
    }

    if (!user) {
      window.location.href = 'auth.html';
      return;
    }

    const userEmailEl = document.getElementById('user-email');
    if (userEmailEl) {
      userEmailEl.textContent = user.email;
    }
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
