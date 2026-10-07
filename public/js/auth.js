const state = {
  mode: 'login',
};

const form = document.getElementById('auth-form');
const loginTab = document.getElementById('tab-login');
const registerTab = document.getElementById('tab-register');
const registerOnlyFields = document.querySelectorAll('.register-only');
const identifierField = document.getElementById('identifier-field');
const identifierInput = document.getElementById('identifier');
const identifierLabel = document.getElementById('identifier-label');
const passwordInput = document.getElementById('password');
const togglePasswordButton = document.getElementById('toggle-password');
const submitButton = document.getElementById('submit-button');
const alertBox = document.getElementById('auth-alert');
const alertMessage = document.getElementById('auth-alert-message');

function setMode(mode) {
  state.mode = mode;
  const isLogin = mode === 'login';

  loginTab.classList.toggle('active', isLogin);
  registerTab.classList.toggle('active', !isLogin);
  loginTab.setAttribute('aria-selected', String(isLogin));
  registerTab.setAttribute('aria-selected', String(!isLogin));

  registerOnlyFields.forEach((field) => field.classList.toggle('hidden', isLogin));
  identifierField.classList.toggle('hidden', !isLogin);

  identifierLabel.textContent = isLogin ? 'Username or Email' : 'Username';
  identifierInput.required = isLogin;
  submitButton.textContent = isLogin ? 'Log in' : 'Register';
  passwordInput.autocomplete = isLogin ? 'current-password' : 'new-password';
  hideAlert();
}

function showAlert(message) {
  alertMessage.textContent = message;
  alertBox.classList.remove('hidden');
}

function hideAlert() {
  alertMessage.textContent = '';
  alertBox.classList.add('hidden');
}

function setSubmitting(isSubmitting) {
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting
    ? state.mode === 'login'
      ? 'Logging in...'
      : 'Registering...'
    : state.mode === 'login'
      ? 'Log in'
      : 'Register';
}

async function redirectIfLoggedIn() {
  const response = await fetch('/api/auth/me');
  if (response.ok) {
    window.location.href = '/wall.html';
  }
}

async function submitAuth(event) {
  event.preventDefault();
  hideAlert();
  setSubmitting(true);

  const formData = new FormData(form);
  const endpoint = state.mode === 'login' ? '/api/auth/login' : '/api/auth/register';
  const payload = state.mode === 'login'
    ? {
        identifier: formData.get('identifier'),
        password: formData.get('password'),
      }
    : {
        displayName: formData.get('displayName'),
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
      };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.error || 'Authentication failed.');
      return;
    }

    window.location.href = '/wall.html';
  } catch (error) {
    showAlert('Could not reach the server. Please try again.');
  } finally {
    setSubmitting(false);
  }
}

loginTab.addEventListener('click', () => setMode('login'));
registerTab.addEventListener('click', () => setMode('register'));
form.addEventListener('submit', submitAuth);

togglePasswordButton.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePasswordButton.textContent = isPassword ? 'Hide' : 'Show';
});

setMode('login');
redirectIfLoggedIn();
