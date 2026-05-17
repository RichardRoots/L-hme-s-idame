const THEME_KEY = 'bussradar.theme';

const state = {
  user: null,
  theme: loadTheme(),
};

const els = {};

document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  applyTheme(state.theme);
  bindEvents();
  await loadAuthStatus();
  lucide.createIcons();
});

function cacheElements() {
  els.themeToggle = document.querySelector('#themeToggle');
  els.authStatus = document.querySelector('#authStatus');
  els.authForm = document.querySelector('#authForm');
  els.authUsername = document.querySelector('#authUsername');
  els.authPassword = document.querySelector('#authPassword');
  els.loginButton = document.querySelector('#loginButton');
  els.registerButton = document.querySelector('#registerButton');
  els.logoutButton = document.querySelector('#logoutButton');
  els.signedInActions = document.querySelector('#signedInActions');
  els.authMessage = document.querySelector('#authMessage');
}

function bindEvents() {
  els.themeToggle.addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  els.authForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth('login');
  });

  els.registerButton.addEventListener('click', () => {
    submitAuth('register');
  });

  els.logoutButton.addEventListener('click', () => {
    logoutUser();
  });
}

async function loadAuthStatus() {
  try {
    const data = await fetchJson('api.php?action=authStatus');
    syncAuthState(data);
  } catch (error) {
    state.user = null;
    renderAuthUi(error.message);
  }
}

async function submitAuth(action) {
  const username = els.authUsername.value.trim();
  const password = els.authPassword.value;

  if (!username || !password) {
    renderAuthUi('Sisesta kasutajanimi ja parool.');
    return;
  }

  setBusy(true);
  renderAuthUi(action === 'register' ? 'Loon kontot...' : 'Login sisse...');

  try {
    const data = await fetchJson(`api.php?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    syncAuthState(data);
    await syncPreferencesAfterLogin(data.preferences);
    window.location.href = 'index.php';
  } catch (error) {
    renderAuthUi(error.message);
  } finally {
    setBusy(false);
  }
}

async function logoutUser() {
  setBusy(true);
  try {
    await fetchJson('api.php?action=logout', { method: 'POST' });
    state.user = null;
    renderAuthUi('Välja logitud.');
  } catch (error) {
    renderAuthUi(error.message);
  } finally {
    setBusy(false);
  }
}

function syncAuthState(data) {
  state.user = data.authenticated ? data.user : null;

  if (state.user && hasStoredPreferences(data.preferences)) {
    applyStoredPreferences(data.preferences);
  }

  renderAuthUi();
}

function renderAuthUi(message = '') {
  const signedIn = Boolean(state.user);
  els.authStatus.textContent = signedIn ? state.user.username : 'Pole sisse logitud';
  els.authForm.hidden = signedIn;
  els.signedInActions.hidden = !signedIn;
  els.authMessage.textContent = message || (signedIn ? 'Sisse logitud.' : '');
}

function setBusy(isBusy) {
  els.authForm.querySelectorAll('input, button').forEach((element) => {
    element.disabled = isBusy;
  });
  els.logoutButton.disabled = isBusy;
}

async function syncPreferencesAfterLogin(preferences) {
  if (hasStoredPreferences(preferences)) {
    applyStoredPreferences(preferences);
    return;
  }

  await fetchJson('api.php?action=preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(localPreferencesPayload()),
  });
}

function localPreferencesPayload() {
  return {
    lines: readJson('bussradar.lines', []),
    stop: readJson('bussradar.stop', null),
    favoriteStops: readJson('bussradar.favoriteStops', []),
    lineColors: readJson('bussradar.lineColors', {}),
    lineEmphasis: readJson('bussradar.lineEmphasis', {}),
    theme: state.theme,
  };
}

function applyStoredPreferences(preferences) {
  localStorage.setItem('bussradar.lines', JSON.stringify(preferences.lines || []));
  localStorage.setItem('bussradar.stop', JSON.stringify(preferences.stop || null));
  localStorage.setItem('bussradar.favoriteStops', JSON.stringify(preferences.favoriteStops || []));
  localStorage.setItem('bussradar.lineColors', JSON.stringify(preferences.lineColors || {}));
  localStorage.setItem('bussradar.lineEmphasis', JSON.stringify(preferences.lineEmphasis || {}));
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
    || preferences.theme === 'dark';
}

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

async function fetchJson(url, options = {}) {
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

function setTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, state.theme);
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
    lucide.createIcons();
  }
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
