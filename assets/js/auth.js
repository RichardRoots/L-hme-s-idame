const THEME_KEY = 'bussradar.theme';
const TRANSPORT_TYPE_KEY = 'bussradar.transportType';
const USERNAME_PATTERN = /^[a-z0-9._-]{2,32}$/;
const MIN_PASSWORD_LENGTH = 6;

const state = {
  user: null,
  theme: loadTheme(),
  busy: false,
};

const els = {};

document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  applyTheme(state.theme);
  bindEvents();
  renderAuthUi('Kontrollin kontot...');
  await loadAuthStatus();
  if (!state.user) {
    els.authUsername?.focus();
  }
  renderIcons();
});

function cacheElements() {
  els.themeToggle = document.querySelector('#themeToggle');
  els.authStatus = document.querySelector('#authStatus');
  els.authForm = document.querySelector('#authForm');
  els.authUsername = document.querySelector('#authUsername');
  els.authPassword = document.querySelector('#authPassword');
  els.passwordToggle = document.querySelector('#passwordToggle');
  els.loginButton = document.querySelector('#loginButton');
  els.registerButton = document.querySelector('#registerButton');
  els.logoutButton = document.querySelector('#logoutButton');
  els.signedInActions = document.querySelector('#signedInActions');
  els.authMessage = document.querySelector('#authMessage');
}

function bindEvents() {
  els.themeToggle?.addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  els.authForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth('login');
  });

  els.authUsername?.addEventListener('input', () => {
    els.authUsername.value = normalizeUsernameInput(els.authUsername.value);
    markField(els.authUsername, true);
  });

  els.authPassword?.addEventListener('input', () => {
    markField(els.authPassword, true);
  });

  els.passwordToggle?.addEventListener('click', togglePasswordVisibility);

  els.registerButton?.addEventListener('click', () => {
    submitAuth('register');
  });

  els.logoutButton?.addEventListener('click', () => {
    logoutUser();
  });
}

async function loadAuthStatus() {
  try {
    const data = await fetchJson('api.html?action=authStatus');
    syncAuthState(data);
  } catch (error) {
    state.user = null;
    renderAuthUi(readableError(error), 'error');
  }
}

async function submitAuth(action) {
  const payload = authPayloadFromForm(action);
  if (!payload) {
    return;
  }

  setBusy(true, action);
  renderAuthUi(action === 'register' ? 'Loon kontot...' : 'Login sisse...');

  try {
    const data = await fetchJson(`api.html?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    syncAuthState(data, action === 'register' ? 'Konto loodud.' : 'Sisse logitud.');
    await syncPreferencesAfterLogin(data.preferences);
    window.location.href = 'index.html';
  } catch (error) {
    renderAuthUi(readableError(error), 'error');
  } finally {
    setBusy(false);
  }
}

async function logoutUser() {
  setBusy(true, 'logout');
  renderAuthUi('Login välja...');
  try {
    await fetchJson('api.html?action=logout', { method: 'POST' });
    state.user = null;
    els.authPassword.value = '';
    renderAuthUi('Välja logitud.', 'success');
    window.setTimeout(() => els.authUsername?.focus(), 0);
  } catch (error) {
    renderAuthUi(readableError(error), 'error');
  } finally {
    setBusy(false);
  }
}

function authPayloadFromForm(action) {
  const username = normalizeUsernameInput(els.authUsername.value);
  const password = els.authPassword.value;
  els.authUsername.value = username;

  const usernameOk = USERNAME_PATTERN.test(username);
  const passwordOk = action === 'login' ? password.length > 0 : password.length >= MIN_PASSWORD_LENGTH;
  markField(els.authUsername, usernameOk);
  markField(els.authPassword, passwordOk);

  if (!usernameOk) {
    renderAuthUi('Kasutajanimi peab olema 2-32 märki: tähed, numbrid, punkt, alakriips või sidekriips.', 'error');
    els.authUsername.focus();
    return null;
  }

  if (!passwordOk) {
    renderAuthUi(action === 'register' ? `Parool peab olema vähemalt ${MIN_PASSWORD_LENGTH} märki.` : 'Sisesta parool.', 'error');
    els.authPassword.focus();
    return null;
  }

  return { username, password };
}

function syncAuthState(data, message = '') {
  state.user = data.authenticated ? data.user : null;

  if (state.user && hasStoredPreferences(data.preferences)) {
    applyStoredPreferences(data.preferences);
  }

  renderAuthUi(message, message ? 'success' : '');
}

function renderAuthUi(message = '', tone = '') {
  const signedIn = Boolean(state.user);
  els.authStatus.textContent = signedIn ? state.user.username : 'Pole sisse logitud';
  els.authForm.hidden = signedIn;
  els.signedInActions.hidden = !signedIn;
  els.authMessage.textContent = message || (signedIn ? 'Sisse logitud.' : '');
  els.authMessage.classList.toggle('is-error', tone === 'error');
  els.authMessage.classList.toggle('is-success', tone === 'success');
}

function setBusy(isBusy, action = '') {
  state.busy = isBusy;
  els.authForm?.setAttribute('aria-busy', String(isBusy));
  els.signedInActions?.setAttribute('aria-busy', String(isBusy));
  els.authForm?.querySelectorAll('input, button').forEach((element) => {
    element.disabled = isBusy;
  });
  if (els.logoutButton) {
    els.logoutButton.disabled = isBusy;
  }

  setButtonText(els.loginButton, action === 'login' && isBusy ? 'Login...' : 'Logi sisse');
  setButtonText(els.registerButton, action === 'register' && isBusy ? 'Loon...' : 'Loo konto');
  setButtonText(els.logoutButton, action === 'logout' && isBusy ? 'Login välja...' : 'Logi välja');
}

async function syncPreferencesAfterLogin(preferences) {
  if (hasStoredPreferences(preferences)) {
    applyStoredPreferences(preferences);
    return;
  }

  await fetchJson('api.html?action=preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(localPreferencesPayload()),
  });
}

function localPreferencesPayload() {
  const transportType = sanitizeTransportType(readStorage(TRANSPORT_TYPE_KEY, 'bus'));
  const fallbackLines = transportType === 'bus' ? readJson('bussradar.lines', []) : [];
  return {
    lines: readJson(linesStorageKey(transportType), fallbackLines),
    transportType,
    stop: readJson('bussradar.stop', null),
    favoriteStops: readJson('bussradar.favoriteStops', []),
    lineColors: readJson('bussradar.lineColors', {}),
    lineEmphasis: readJson('bussradar.lineEmphasis', {}),
    theme: state.theme,
  };
}

function applyStoredPreferences(preferences) {
  const transportType = sanitizeTransportType(preferences.transportType || 'bus');
  writeStorage(TRANSPORT_TYPE_KEY, transportType);
  writeStorage(linesStorageKey(transportType), JSON.stringify(preferences.lines || []));
  if (transportType === 'bus') {
    writeStorage('bussradar.lines', JSON.stringify(preferences.lines || []));
  }
  writeStorage('bussradar.stop', JSON.stringify(preferences.stop || null));
  writeStorage('bussradar.favoriteStops', JSON.stringify(preferences.favoriteStops || []));
  writeStorage('bussradar.lineColors', JSON.stringify(preferences.lineColors || {}));
  writeStorage('bussradar.lineEmphasis', JSON.stringify(preferences.lineEmphasis || {}));
  setTheme(preferences.theme === 'dark' ? 'dark' : 'light');
}

function hasStoredPreferences(preferences) {
  if (!preferences || typeof preferences !== 'object') {
    return false;
  }

  return (Array.isArray(preferences.lines) && preferences.lines.length > 0)
    || Boolean(preferences.stop)
    || (Array.isArray(preferences.favoriteStops) && preferences.favoriteStops.length > 0)
    || Object.keys(preferences.lineColors || {}).length > 0
    || Object.keys(preferences.lineEmphasis || {}).length > 0
    || preferences.transportType === 'tram'
    || preferences.theme === 'dark';
}

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(readStorage(key, 'null') || 'null');
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

async function fetchJson(url, options = {}) {
  if (window.BussRadarApi?.canHandle?.(url)) {
    return window.BussRadarApi.request(url, options);
  }

  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Päring ebaõnnestus.');
  }
  return data;
}

function togglePasswordVisibility() {
  const shouldShow = els.authPassword.type === 'password';
  els.authPassword.type = shouldShow ? 'text' : 'password';
  els.passwordToggle.setAttribute('aria-pressed', String(shouldShow));
  els.passwordToggle.title = shouldShow ? 'Peida parool' : 'Näita parooli';
  els.passwordToggle.setAttribute('aria-label', els.passwordToggle.title);
  els.passwordToggle.innerHTML = `<i data-lucide="${shouldShow ? 'eye-off' : 'eye'}"></i>`;
  renderIcons();
  els.authPassword.focus();
}

function setButtonText(button, text) {
  const label = button?.querySelector('span');
  if (label) {
    label.textContent = text;
  }
}

function markField(input, valid) {
  input?.classList.toggle('is-invalid', !valid);
}

function normalizeUsernameInput(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function sanitizeTransportType(type) {
  return type === 'tram' ? 'tram' : 'bus';
}

function linesStorageKey(type) {
  return `bussradar.lines.${sanitizeTransportType(type)}`;
}

function readableError(error) {
  return error?.message || 'Toiming ebaõnnestus.';
}

function setTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  writeStorage(THEME_KEY, state.theme);
  applyTheme(state.theme);
}

function applyTheme(theme) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalizedTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalizedTheme === 'dark' ? '#101a18' : '#0f5e62');

  const dark = normalizedTheme === 'dark';
  els.themeToggle.title = dark ? 'Hele režiim' : 'Tume režiim';
  els.themeToggle.setAttribute('aria-label', els.themeToggle.title);
  els.themeToggle.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
  if (window.lucide) {
    renderIcons();
  }
}

function renderIcons() {
  window.lucide?.createIcons();
}

function loadTheme() {
  try {
    return readStorage(THEME_KEY, 'light') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readStorage(key, fallback = '') {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Vorm töötab ka siis, kui brauser ei luba salvestamist.
  }
}
