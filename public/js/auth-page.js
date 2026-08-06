import { signIn } from './auth.js';

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  signIn(form.email.value, form.password.value);
});
