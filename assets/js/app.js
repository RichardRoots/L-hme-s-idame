const TALLINN_CENTER = [59.437, 24.7536];
const DEFAULT_LINES = ['18', '40', '60'];
const DEFAULT_STOP = { id: '1297', name: 'Laikmaa', lat: 59.43614, lon: 24.75755 };
const REFRESH_SECONDS = 10;
const THEME_KEY = 'bussradar.theme';
const ROUTE_DIRECTION_PATTERNS = [
  { label: '1. suund', dashArray: null, dashOffset: '0', weight: 5, priority: 0 },
  { label: '2. suund', dashArray: '1 8', dashOffset: '0', weight: 6, priority: 1 },
  { label: '3. suund', dashArray: '8 7', dashOffset: '0', weight: 5, priority: 2 },
  { label: '4. suund', dashArray: '12 5 2 5', dashOffset: '0', weight: 5, priority: 3 },
];

const state = {
  map: null,
  routeLayer: null,
  mapStopLayer: null,
  vehicleLayer: null,
  schoolLayer: null,
  stopLayer: null,
  favoriteStopLayer: null,
  vehicleMarkers: new Map(),
  mapStopMarkers: new Map(),
  favoriteStopMarkers: new Map(),
  selectedLines: loadLines(),
  lineColors: loadLineColors(),
  lineEmphasis: loadLineEmphasis(),
  selectedStop: loadStop(),
  favoriteStops: loadFavoriteStops(),
  vehicles: [],
  routes: [],
  mapStops: [],
  departures: [],
  schools: [],
  schoolsVisible: false,
  shouldFitVehicles: true,
  refreshCountdown: REFRESH_SECONDS,
  refreshTimer: null,
  countdownTimer: null,
  deferredInstallPrompt: null,
  user: null,
  theme: loadTheme(),
  preferenceSaveTimer: null,
};

const els = {};

document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  applyTheme(state.theme);
  createMap();
  bindEvents();
  renderLineTags();
  registerServiceWorker();
  await loadAuthStatus();
  loadInitialData();
  lucide.createIcons();
});

function cacheElements() {
  els.connectionStatus = document.querySelector('#connectionStatus');
  els.vehicleCount = document.querySelector('#vehicleCount');
  els.lastUpdated = document.querySelector('#lastUpdated');
  els.nextRefresh = document.querySelector('#nextRefresh');
  els.lineForm = document.querySelector('#lineForm');
  els.lineInput = document.querySelector('#lineInput');
  els.selectedLines = document.querySelector('#selectedLines');
  els.vehicleList = document.querySelector('#vehicleList');
  els.refreshButton = document.querySelector('#refreshButton');
  els.locateButton = document.querySelector('#locateButton');
  els.installButton = document.querySelector('#installButton');
  els.themeToggle = document.querySelector('#themeToggle');
  els.accountLink = document.querySelector('#accountLink');
  els.authButtonText = document.querySelector('#authButtonText');
  els.stopSearchForm = document.querySelector('#stopSearchForm');
  els.stopSearch = document.querySelector('#stopSearch');
  els.stopResults = document.querySelector('#stopResults');
  els.selectedStopName = document.querySelector('#selectedStopName');
  els.departures = document.querySelector('#departures');
  els.favoriteStopForm = document.querySelector('#favoriteStopForm');
  els.favoriteStopSearch = document.querySelector('#favoriteStopSearch');
  els.favoriteStopResults = document.querySelector('#favoriteStopResults');
  els.favoriteStopList = document.querySelector('#favoriteStopList');
  els.favoriteStopCount = document.querySelector('#favoriteStopCount');
  els.weatherUpdated = document.querySelector('#weatherUpdated');
  els.weatherTemp = document.querySelector('#weatherTemp');
  els.weatherText = document.querySelector('#weatherText');
  els.walkingAdvice = document.querySelector('#walkingAdvice');
  els.toggleSchools = document.querySelector('#toggleSchools');
  els.schoolCrowds = document.querySelector('#schoolCrowds');
  els.delaySummary = document.querySelector('#delaySummary');
  els.delayList = document.querySelector('#delayList');
}

function createMap() {
  state.map = L.map('map', {
    zoomControl: false,
    preferCanvas: false,
  }).setView(TALLINN_CENTER, 12);

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  }).addTo(state.map);

  state.map.createPane('routePane');
  state.map.createPane('schoolPane');
  state.map.createPane('mapStopPane');
  state.map.createPane('stopPane');
  state.map.createPane('favoriteStopPane');
  state.map.createPane('vehiclePane');
  state.map.getPane('routePane').style.zIndex = 405;
  state.map.getPane('schoolPane').style.zIndex = 410;
  state.map.getPane('mapStopPane').style.zIndex = 500;
  state.map.getPane('stopPane').style.zIndex = 520;
  state.map.getPane('favoriteStopPane').style.zIndex = 560;
  state.map.getPane('vehiclePane').style.zIndex = 690;

  state.routeLayer = L.layerGroup().addTo(state.map);
  state.schoolLayer = L.layerGroup().addTo(state.map);
  state.mapStopLayer = L.layerGroup().addTo(state.map);
  state.stopLayer = L.layerGroup().addTo(state.map);
  state.favoriteStopLayer = L.layerGroup().addTo(state.map);
  state.vehicleLayer = L.layerGroup().addTo(state.map);

  state.map.on('zoomend', updateMapDensity);
  state.map.on('popupopen', hydrateIcons);
  updateMapDensity();
}

function updateMapDensity() {
  if (!state.map) return;
  state.map.getContainer().classList.toggle('show-vehicle-labels', state.map.getZoom() >= 14);
}

function hydrateIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

function bindEvents() {
  els.themeToggle.addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  els.lineForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = normalizeLine(els.lineInput.value);
    if (!value) return;

    if (!state.selectedLines.includes(value)) {
      state.selectedLines.push(value);
      saveLines();
      renderLineTags();
      state.shouldFitVehicles = true;
      fetchVehicles();
      fetchRoutes();
    }

    els.lineInput.value = '';
  });

  els.refreshButton.addEventListener('click', () => {
    refreshAll();
  });

  els.locateButton.addEventListener('click', () => {
    locateUser();
  });

  els.stopSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    searchStops();
  });

  document.addEventListener('click', handleFavoritePopupClick);

  els.favoriteStopForm.addEventListener('submit', (event) => {
    event.preventDefault();
    searchFavoriteStops();
  });

  els.toggleSchools.addEventListener('click', () => {
    state.schoolsVisible = !state.schoolsVisible;
    renderSchools();
    els.toggleSchools.classList.toggle('muted', !state.schoolsVisible);
  });

  els.installButton.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });
}

async function loadAuthStatus() {
  try {
    const data = await fetchJson('api.php?action=authStatus');
    syncAuthState(data, { reload: false, saveIfEmpty: false });
  } catch (error) {
    state.user = null;
    renderAuthUi();
  }
}

function syncAuthState(data, { reload = false, saveIfEmpty = false } = {}) {
  state.user = data.authenticated ? data.user : null;

  if (state.user && hasStoredPreferences(data.preferences)) {
    applyUserPreferences(data.preferences, reload);
  } else if (state.user && saveIfEmpty) {
    savePreferencesNow().catch((error) => renderAuthUi(error.message));
  }

  renderAuthUi();
}

function renderAuthUi(message = '') {
  const signedIn = Boolean(state.user);
  if (els.authButtonText) {
    els.authButtonText.textContent = signedIn ? shortText(state.user.username, 14) : 'Logi sisse';
  }

  if (els.accountLink) {
    els.accountLink.title = signedIn ? `Konto: ${state.user.username}` : 'Logi sisse';
    els.accountLink.setAttribute('aria-label', els.accountLink.title);
    const icon = els.accountLink.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', signedIn ? 'user-round' : 'log-in');
      lucide.createIcons();
    }
  }
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

function applyUserPreferences(preferences, reload = false) {
  const lines = Array.isArray(preferences.lines)
    ? preferences.lines.map((line) => normalizeLine(String(line))).filter(Boolean)
    : [];
  if (lines.length > 0) {
    state.selectedLines = [...new Set(lines)];
  }

  if (preferences.stop && preferences.stop.id) {
    state.selectedStop = preferences.stop;
  }

  state.favoriteStops = Array.isArray(preferences.favoriteStops)
    ? preferences.favoriteStops.filter(isStopCoordinate)
    : [];
  state.lineColors = sanitizeLineColors(preferences.lineColors || {});
  state.lineEmphasis = sanitizeLineEmphasis(preferences.lineEmphasis || {});
  setTheme(preferences.theme === 'dark' ? 'dark' : 'light', false);
  persistLocalPreferences();

  els.selectedStopName.textContent = state.selectedStop.name;
  renderLineTags();
  placeStopMarker(state.selectedStop);
  renderFavoriteStops();

  if (reload) {
    state.shouldFitVehicles = true;
    fetchVehicles();
    fetchRoutes();
    fetchDepartures(state.selectedStop);
  }
}

function sanitizeLineColors(colors) {
  return Object.fromEntries(
    Object.entries(colors)
      .map(([line, color]) => [normalizeLine(String(line)), String(color)])
      .filter(([line, color]) => line && isHexColor(color))
  );
}

function sanitizeLineEmphasis(values) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([line, value]) => [normalizeLine(String(line)), clampNumber(Number(value), 0, 1)])
      .filter(([line, value]) => line && Number.isFinite(value))
  );
}

function queuePreferenceSave() {
  if (!state.user) {
    return;
  }

  window.clearTimeout(state.preferenceSaveTimer);
  state.preferenceSaveTimer = window.setTimeout(() => {
    savePreferencesNow().catch((error) => renderAuthUi(error.message));
  }, 500);
}

async function savePreferencesNow() {
  if (!state.user) {
    return;
  }

  window.clearTimeout(state.preferenceSaveTimer);
  await fetchJson('api.php?action=preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferencesPayload()),
  });
  renderAuthUi();
}

function preferencesPayload() {
  return {
    lines: state.selectedLines,
    stop: state.selectedStop,
    favoriteStops: state.favoriteStops,
    lineColors: state.lineColors,
    lineEmphasis: state.lineEmphasis,
    theme: state.theme,
  };
}

function persistLocalPreferences() {
  localStorage.setItem('bussradar.lines', JSON.stringify(state.selectedLines));
  localStorage.setItem('bussradar.stop', JSON.stringify(state.selectedStop));
  localStorage.setItem('bussradar.favoriteStops', JSON.stringify(state.favoriteStops));
  localStorage.setItem('bussradar.lineColors', JSON.stringify(state.lineColors));
  localStorage.setItem('bussradar.lineEmphasis', JSON.stringify(state.lineEmphasis));
  localStorage.setItem(THEME_KEY, state.theme);
}

function setTheme(theme, shouldSave = true) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, state.theme);
  applyTheme(state.theme);
  if (shouldSave) {
    queuePreferenceSave();
  }
}

function applyTheme(theme) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalizedTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalizedTheme === 'dark' ? '#101a18' : '#0f5e62');

  if (!els.themeToggle) {
    return;
  }

  const dark = normalizedTheme === 'dark';
  els.themeToggle.title = dark ? 'Hele režiim' : 'Tume režiim';
  els.themeToggle.setAttribute('aria-label', els.themeToggle.title);
  els.themeToggle.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
  if (window.lucide) {
    lucide.createIcons();
  }
}

function loadInitialData() {
  els.selectedStopName.textContent = state.selectedStop.name;
  els.toggleSchools.classList.toggle('muted', !state.schoolsVisible);
  placeStopMarker(state.selectedStop);
  renderFavoriteStops();
  fetchRoutes();
  refreshAll();
  loadSchools();
  fetchWeather();
  startRefreshLoop();
}

function refreshAll() {
  fetchVehicles();
  fetchDepartures(state.selectedStop);
  fetchWeather();
}

function startRefreshLoop() {
  window.clearInterval(state.refreshTimer);
  window.clearInterval(state.countdownTimer);

  state.refreshCountdown = REFRESH_SECONDS;
  els.nextRefresh.textContent = `${state.refreshCountdown} s`;

  state.countdownTimer = window.setInterval(() => {
    state.refreshCountdown -= 1;
    if (state.refreshCountdown <= 0) {
      state.refreshCountdown = REFRESH_SECONDS;
    }
    els.nextRefresh.textContent = `${state.refreshCountdown} s`;
  }, 1000);

  state.refreshTimer = window.setInterval(() => {
    refreshAll();
    state.refreshCountdown = REFRESH_SECONDS;
  }, REFRESH_SECONDS * 1000);
}

async function fetchVehicles() {
  if (state.selectedLines.length === 0) {
    state.vehicles = [];
    renderVehicles();
    renderDelayPanel();
    setStatus('Vali liin', false);
    return;
  }

  setStatus('Laen busse', false);
  const params = new URLSearchParams({
    action: 'vehicles',
    type: 'bus',
    lines: state.selectedLines.join(','),
  });

  try {
    const data = await fetchJson(`api.php?${params.toString()}`);
    state.vehicles = (data.vehicles || []).filter(isVehicleCoordinate);
    renderVehicles();
    renderDelayPanel();
    els.lastUpdated.textContent = timeNow();
    setStatus('Reaalajas', true);
  } catch (error) {
    setStatus('Live-andmed maas', false);
    renderInlineError(els.delayList, error.message);
  }
}

function renderVehicles() {
  state.vehicleLayer.clearLayers();
  state.vehicleMarkers.clear();

  state.vehicles.forEach((vehicle) => {
    const emphasis = lineMapOpacity(vehicle.line);
    if (emphasis <= 0) {
      return;
    }

    const risk = vehicleDelayRisk(vehicle);
    const marker = L.marker([vehicle.lat, vehicle.lon], {
      icon: vehicleIcon(vehicle, risk),
      pane: 'vehiclePane',
      title: `Liin ${vehicle.line}`,
      zIndexOffset: 1000,
      opacity: emphasis,
    });

    marker.bindPopup(vehiclePopup(vehicle, risk));
    marker.addTo(state.vehicleLayer);
    state.vehicleMarkers.set(vehicleKey(vehicle), marker);
  });

  els.vehicleCount.textContent = `${state.vehicles.length} kaardil`;
  renderVehicleList();

  if (state.vehicles.length > 0 && state.shouldFitVehicles) {
    const bounds = L.latLngBounds(state.vehicles.map((vehicle) => [vehicle.lat, vehicle.lon]));
    if (bounds.isValid()) {
      state.map.fitBounds(bounds.pad(0.28), { maxZoom: 15, animate: true });
    }
    state.shouldFitVehicles = false;
  }
}

function isVehicleCoordinate(vehicle) {
  const lat = Number(vehicle.lat);
  const lon = Number(vehicle.lon);
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= 59.25 && lat <= 59.65
    && lon >= 24.35 && lon <= 25.25;
}

function isStopCoordinate(stop) {
  const lat = Number(stop?.lat);
  const lon = Number(stop?.lon);
  return Boolean(stop?.id)
    && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= 59.25 && lat <= 59.65
    && lon >= 24.35 && lon <= 25.25;
}

async function loadMapStops() {
  try {
    const data = await fetchJson('api.php?action=mapStops');
    state.mapStops = data.stops || [];
    renderMapStops();
  } catch (error) {
    setStatus('Peatused puuduvad', false);
  }
}

function renderMapStops() {
  state.mapStopLayer.clearLayers();
  state.mapStopMarkers.clear();

  state.mapStops.forEach((stop) => {
    const color = routeColor((stop.lines && stop.lines[0]) || stop.line || '');
    const marker = L.circleMarker([stop.lat, stop.lon], {
      pane: 'mapStopPane',
      radius: 5,
      color,
      weight: 2,
      fillColor: '#fbfdff',
      fillOpacity: 0.96,
      opacity: 0.95,
      bubblingMouseEvents: false,
    }).addTo(state.mapStopLayer);

    marker.bindPopup(stopPopupContent(stop, [], true), {
      minWidth: 240,
      maxWidth: 310,
    });

    marker.on('click', async (event) => {
      if (event?.originalEvent) {
        L.DomEvent.stop(event.originalEvent);
      }

      selectStop(stop);
      marker.setPopupContent(stopPopupContent(stop, [], true));
      marker.openPopup();
      hydrateIcons();
      await loadStopPopupDepartures(stop, marker);
    });

    state.mapStopMarkers.set(stop.stopId || stop.id, marker);
  });
}

async function searchFavoriteStops() {
  const query = els.favoriteStopSearch.value.trim();
  if (query.length < 2) {
    els.favoriteStopResults.innerHTML = '';
    return;
  }

  els.favoriteStopResults.innerHTML = '<div class="empty-state">Otsin...</div>';
  const params = new URLSearchParams({ action: 'stops', q: query });

  try {
    const data = await fetchJson(`api.php?${params.toString()}`);
    renderFavoriteStopResults(data.stops || []);
  } catch (error) {
    renderInlineError(els.favoriteStopResults, error.message);
  }
}

function renderFavoriteStopResults(stops) {
  if (stops.length === 0) {
    els.favoriteStopResults.innerHTML = '<div class="empty-state">Peatust ei leitud</div>';
    return;
  }

  els.favoriteStopResults.innerHTML = stops.slice(0, 6).map((stop, index) => `
    <button class="stop-result" type="button" data-stop-index="${index}">
      <strong>${escapeHtml(stop.name)}</strong>
      <span>${escapeHtml(stop.street || `ID ${stop.id}`)}</span>
    </button>
  `).join('');

  els.favoriteStopResults.querySelectorAll('.stop-result').forEach((button) => {
    button.addEventListener('click', () => {
      const stop = stops[Number(button.dataset.stopIndex)];
      if (stop) {
        addFavoriteStop(stop);
      }
    });
  });
}

function addFavoriteStop(stop, shouldFocus = true) {
  if (!isStopCoordinate(stop)) {
    return false;
  }

  const key = stopKey(stop);
  if (!state.favoriteStops.some((item) => stopKey(item) === key)) {
    state.favoriteStops.push(normalizeStopForStorage(stop));
    saveFavoriteStops();
  }

  els.favoriteStopSearch.value = '';
  els.favoriteStopResults.innerHTML = '';
  renderFavoriteStops();
  if (shouldFocus) {
    focusFavoriteStop(stop);
  }
  return true;
}

function removeFavoriteStop(key) {
  state.favoriteStops = state.favoriteStops.filter((stop) => stopKey(stop) !== key);
  saveFavoriteStops();
  renderFavoriteStops();
}

function renderFavoriteStops() {
  state.favoriteStopLayer.clearLayers();
  state.favoriteStopMarkers.clear();

  els.favoriteStopCount.textContent = `${state.favoriteStops.length} valitud`;

  if (state.favoriteStops.length === 0) {
    els.favoriteStopList.innerHTML = '<div class="empty-state">Lemmikpeatusi pole lisatud</div>';
    return;
  }

  els.favoriteStopList.innerHTML = state.favoriteStops.map((stop) => {
    const key = stopKey(stop);
    return `
      <article class="favorite-stop-row" data-stop-key="${escapeHtml(key)}">
        <button class="favorite-stop-focus" type="button" data-stop-key="${escapeHtml(key)}">
          <span class="favorite-stop-mini" aria-hidden="true"></span>
          <span>
            <strong>${escapeHtml(stop.name || 'Peatus')}</strong>
            <small>${escapeHtml(stop.street || `ID ${stop.id}`)}</small>
          </span>
        </button>
        <button class="line-remove" type="button" data-remove-stop="${escapeHtml(key)}" title="Eemalda lemmik" aria-label="Eemalda lemmik">
          <i data-lucide="x"></i>
        </button>
      </article>
    `;
  }).join('');

  state.favoriteStops.forEach((stop) => {
    const marker = L.marker([stop.lat, stop.lon], {
      pane: 'favoriteStopPane',
      icon: favoriteStopIcon(stop),
      title: stop.name || 'Lemmikpeatus',
      zIndexOffset: 700,
    }).addTo(state.favoriteStopLayer);

    marker.bindPopup(stopPopupContent(stop, [], true), {
      minWidth: 240,
      maxWidth: 310,
    });

    marker.on('click', async () => {
      selectStop(stop);
      await loadStopPopupDepartures(stop, marker);
    });

    state.favoriteStopMarkers.set(stopKey(stop), marker);
  });

  els.favoriteStopList.querySelectorAll('.favorite-stop-focus').forEach((button) => {
    button.addEventListener('click', () => {
      const stop = state.favoriteStops.find((item) => stopKey(item) === button.dataset.stopKey);
      if (stop) {
        focusFavoriteStop(stop);
      }
    });
  });

  els.favoriteStopList.querySelectorAll('[data-remove-stop]').forEach((button) => {
    button.addEventListener('click', () => {
      removeFavoriteStop(button.dataset.removeStop);
    });
  });

  lucide.createIcons();
}

function favoriteStopIcon(stop) {
  return L.divIcon({
    className: 'favorite-stop-marker',
    html: `
      <div class="favorite-stop-pin">
        <i data-lucide="star"></i>
      </div>
    `,
    iconSize: [32, 39],
    iconAnchor: [16, 31],
    popupAnchor: [0, -28],
  });
}

function focusFavoriteStop(stop) {
  state.map.setView([stop.lat, stop.lon], Math.max(state.map.getZoom(), 16), { animate: true });
  const marker = state.favoriteStopMarkers.get(stopKey(stop));
  if (marker) {
    window.setTimeout(() => {
      selectStop(stop);
      loadStopPopupDepartures(stop, marker);
    }, 220);
  }
}

function handleFavoritePopupClick(event) {
  const button = event.target.closest('[data-favorite-stop]');
  if (!button) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const stop = decodeFavoriteStop(button.dataset.favoriteStop);
  if (!stop) {
    return;
  }

  if (isFavoriteStop(stop)) {
    removeFavoriteStop(stopKey(stop));
    markFavoritePopupButton(button, false);
    return;
  }

  if (addFavoriteStop(stop, false)) {
    markFavoritePopupButton(button, true);
  }
}

function favoriteStopButton(stop) {
  const active = isFavoriteStop(stop);
  return `
    <button class="popup-favorite-button ${active ? 'is-active' : ''}" type="button"
      data-favorite-stop="${escapeHtml(encodeFavoriteStop(stop))}"
      title="${active ? 'Eemalda lemmikutest' : 'Lisa lemmikuks'}"
      aria-label="${active ? 'Eemalda lemmikutest' : 'Lisa lemmikuks'}"
      aria-pressed="${active ? 'true' : 'false'}">
      <i data-lucide="star"></i>
    </button>
  `;
}

function markFavoritePopupButton(button, active) {
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.setAttribute('aria-label', active ? 'Eemalda lemmikutest' : 'Lisa lemmikuks');
  button.title = active ? 'Eemalda lemmikutest' : 'Lisa lemmikuks';
  hydrateIcons();
}

function isFavoriteStop(stop) {
  const key = stopKey(stop);
  return state.favoriteStops.some((item) => stopKey(item) === key);
}

function encodeFavoriteStop(stop) {
  return encodeURIComponent(JSON.stringify(normalizeStopForStorage(stop)));
}

function decodeFavoriteStop(value) {
  try {
    const stop = JSON.parse(decodeURIComponent(value || ''));
    return isStopCoordinate(stop) ? stop : null;
  } catch {
    return null;
  }
}

async function fetchRoutes() {
  state.routeLayer.clearLayers();
  state.routes = [];

  if (state.selectedLines.length === 0) {
    state.mapStops = [];
    renderMapStops();
    return;
  }

  const params = new URLSearchParams({
    action: 'routes',
    lines: state.selectedLines.join(','),
  });

  try {
    const data = await fetchJson(`api.php?${params.toString()}`);
    state.routes = data.routes || [];
    renderRoutes();
    renderRouteStops();
    if (state.schools.length > 0) {
      renderSchools();
    }
  } catch (error) {
    state.mapStops = [];
    renderMapStops();
    setStatus('Marsruut puudub', false);
  }
}

function renderRoutes() {
  state.routeLayer.clearLayers();

  const styledRoutes = [...state.routes]
    .map((route) => ({ route, style: routeDirectionStyle(route) }))
    .sort((a, b) => a.style.priority - b.style.priority
      || String(a.route.line).localeCompare(String(b.route.line), 'et', { numeric: true }));

  styledRoutes.forEach(({ route, style }) => {
    if (route.shapeQuality === 'stops-only' || !Array.isArray(route.points) || route.points.length < 2) {
      return;
    }

    const color = routeColor(route.line);
    const emphasis = lineMapOpacity(route.line);
    if (emphasis <= 0) {
      return;
    }

    const line = L.polyline(route.points, {
      pane: 'routePane',
      color,
      weight: style.weight,
      opacity: 0.98 * emphasis,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: style.dashArray,
      dashOffset: style.dashOffset,
      smoothFactor: 0,
    }).addTo(state.routeLayer);

    const tooltipParts = [
      `Liin ${escapeHtml(route.line)}`,
      escapeHtml(style.label),
      route.name ? escapeHtml(route.name) : '',
    ];

    line.bindTooltip(tooltipParts.filter(Boolean).join(' · '), {
      sticky: true,
      opacity: 0.95,
    });
  });
}

function routeDirectionStyle(route) {
  const directionIndex = routeDirectionIndex(route);
  return ROUTE_DIRECTION_PATTERNS[directionIndex % ROUTE_DIRECTION_PATTERNS.length];
}

function routeDirectionIndex(route) {
  const tag = String(route.tag || '').toLowerCase();
  if (/^a\d*-b\d*$/.test(tag)) return 0;
  if (/^b\d*-a\d*$/.test(tag)) return 1;

  const sameLineRoutes = state.routes.filter((item) => String(item.line) === String(route.line));
  const routeIndex = sameLineRoutes.indexOf(route);
  return routeIndex >= 0 ? routeIndex : 0;
}

function renderRouteStops() {
  const stopsById = new Map();

  state.routes.forEach((route) => {
    (route.stops || []).forEach((stop) => {
      const key = stop.stopId || stop.id;
      if (!stopsById.has(key)) {
        stopsById.set(key, { ...stop, lines: [route.line] });
      } else {
        const existing = stopsById.get(key);
        if (!existing.lines.includes(route.line)) {
          existing.lines.push(route.line);
        }
      }
    });
  });

  state.mapStops = [...stopsById.values()];
  renderMapStops();
}

function vehicleIcon(vehicle, risk) {
  const riskClass = risk.level === 'high' ? 'risk-high' : risk.level === 'medium' ? 'risk-medium' : '';
  const riskLabel = risk.level === 'high' ? 'Kõrge risk' : risk.level === 'medium' ? 'Võimalik viivitus' : '';
  const riskBadge = riskLabel ? '<span class="vehicle-risk-badge" aria-hidden="true">!</span>' : '';
  const destination = shortText(vehicle.destination || '', 12);
  const color = routeColor(vehicle.line);
  const bearing = Number.isFinite(Number(vehicle.bearing)) ? Number(vehicle.bearing) : 0;
  return L.divIcon({
    className: `vehicle-marker ${riskClass}`,
    html: `
      <div class="vehicle-icon-wrap">
        <div class="vehicle-pin" style="--vehicle-color: ${color}; --bearing: ${bearing}deg;">
          <span class="vehicle-pulse" aria-hidden="true"></span>
          <span class="vehicle-arrow" aria-hidden="true"><i></i></span>
          <strong>${escapeHtml(vehicle.line)}</strong>
          ${riskBadge}
        </div>
        ${riskLabel ? `<span class="vehicle-risk-label">${escapeHtml(riskLabel)}</span>` : ''}
        <span class="vehicle-label">${escapeHtml(destination || vehicle.destination || 'Siht teadmata')}</span>
      </div>
    `,
    iconSize: [112, 96],
    iconAnchor: [56, 23],
    popupAnchor: [0, -26],
  });
}

function renderVehicleList() {
  if (!els.vehicleList) {
    return;
  }

  if (state.vehicles.length === 0) {
    els.vehicleList.innerHTML = '<div class="empty-state">Selle liini bussi ei leitud</div>';
    return;
  }

  const vehicles = [...state.vehicles].sort((a, b) => {
    return a.line.localeCompare(b.line, 'et', { numeric: true })
      || String(a.destination || '').localeCompare(String(b.destination || ''), 'et');
  });

  els.vehicleList.innerHTML = vehicles.map((vehicle) => {
    const age = vehicle.ageSeconds === null || vehicle.ageSeconds === undefined ? '-' : `${Math.round(vehicle.ageSeconds)} s`;
    const risk = vehicleDelayRisk(vehicle);
    const riskClass = risk.level === 'high' ? 'risk-high' : risk.level === 'medium' ? 'risk-medium' : '';
    const riskLabel = risk.level === 'high' ? 'Kõrge risk' : risk.level === 'medium' ? 'Võimalik hilinemine' : '';
    return `
      <button class="vehicle-row ${riskClass}" type="button" data-vehicle-key="${escapeHtml(vehicleKey(vehicle))}">
        <span class="route-badge compact" style="--badge-color: ${routeColor(vehicle.line)}">${escapeHtml(vehicle.line)}</span>
        <span class="vehicle-row-text">
          <strong>${escapeHtml(vehicle.destination || 'Siht teadmata')}</strong>
          ${riskLabel ? `<span class="vehicle-row-risk">${escapeHtml(riskLabel)}</span>` : ''}
          <small>Sõiduk ${escapeHtml(vehicle.id)} · GPS ${age}</small>
        </span>
        <i data-lucide="map-pin"></i>
      </button>
    `;
  }).join('');

  els.vehicleList.querySelectorAll('.vehicle-row').forEach((button) => {
    button.addEventListener('click', () => {
      const vehicle = state.vehicles.find((item) => vehicleKey(item) === button.dataset.vehicleKey);
      if (vehicle) {
        focusVehicle(vehicle);
      }
    });
  });

  lucide.createIcons();
}

function focusVehicle(vehicle) {
  const marker = state.vehicleMarkers.get(vehicleKey(vehicle));
  state.map.setView([vehicle.lat, vehicle.lon], Math.max(state.map.getZoom(), 16), { animate: true });

  if (marker) {
    window.setTimeout(() => marker.openPopup(), 220);
  }
}

function vehiclePopup(vehicle, risk) {
  const speed = vehicle.speed === null || vehicle.speed === undefined ? '-' : `${Math.round(vehicle.speed)} km/h`;
  const age = vehicle.ageSeconds === null || vehicle.ageSeconds === undefined ? '-' : `${Math.round(vehicle.ageSeconds)} s`;
  const riskClass = risk.level === 'high' ? 'high' : risk.level === 'medium' ? 'medium' : 'low';
  const riskDetail = risk.detail ? `<small>${escapeHtml(risk.detail)}</small>` : '';
  return `
    <div class="popup-card vehicle-popup-card risk-${riskClass}">
      <div class="vehicle-popup-head">
        <span>
          <strong>Liin ${escapeHtml(vehicle.line)}</strong>
          <span>${escapeHtml(vehicle.destination || 'Siht teadmata')}</span>
        </span>
        <em class="popup-risk-badge ${riskClass}">${risk.level === 'low' ? 'OK' : '!'}</em>
      </div>
      <div class="popup-risk-note ${riskClass}">
        <strong>${escapeHtml(risk.label)}</strong>
        ${riskDetail}
      </div>
      <dl>
        <dt>Sõiduk</dt><dd>${escapeHtml(vehicle.id)}</dd>
        <dt>Kiirus</dt><dd>${speed}</dd>
        <dt>GPS vanus</dt><dd>${age}</dd>
        <dt>Olek</dt><dd>${risk.label}</dd>
      </dl>
    </div>
  `;
}

async function loadStopPopupDepartures(stop, marker) {
  marker.setPopupContent(stopPopupContent(stop, [], true));
  marker.openPopup();

  const params = new URLSearchParams({
    action: 'departures',
    stopid: stop.id,
  });

  try {
    const data = await fetchJson(`api.php?${params.toString()}`);
    marker.setPopupContent(stopPopupContent(stop, data.departures || [], false));
    marker.openPopup();
    hydrateIcons();
  } catch (error) {
    marker.setPopupContent(stopPopupContent(stop, [], false, error.message));
    marker.openPopup();
    hydrateIcons();
  }
}

function stopPopupContent(stop, departures, loading = false, error = '') {
  const busDepartures = (departures || [])
    .filter((departure) => departure.type === 'bus')
    .slice(0, 6);

  let departuresHtml = '<div class="popup-loading">Laen väljumisi...</div>';

  if (!loading && error) {
    departuresHtml = `<div class="popup-loading error">${escapeHtml(error)}</div>`;
  } else if (!loading && busDepartures.length === 0) {
    departuresHtml = '<div class="popup-loading">Lähiajal busse ei leitud</div>';
  } else if (!loading) {
    departuresHtml = busDepartures.map((departure) => {
      const minutes = departure.minutesUntil === null || departure.minutesUntil === undefined
        ? departure.expectedTime
        : `${departure.minutesUntil} min`;
      return `
        <div class="popup-departure">
          <span class="route-badge mini" style="--badge-color: ${routeColor(departure.line)}">${escapeHtml(departure.line)}</span>
          <span>
            <strong>${escapeHtml(departure.destination || '')}</strong>
            <small>${escapeHtml(minutes)} · ${escapeHtml(departure.expectedTime)}</small>
          </span>
        </div>
      `;
    }).join('');
  }

  return `
    <div class="stop-popup">
      <div class="stop-popup-head">
        <span>
          <strong>${escapeHtml(stop.name)}</strong>
          <small>${escapeHtml(stop.street || `ID ${stop.id}`)}</small>
        </span>
        ${favoriteStopButton(stop)}
      </div>
      <div class="popup-departures">${departuresHtml}</div>
    </div>
  `;
}

function selectStop(stop) {
  state.selectedStop = stop;
  saveStop(stop);
  els.selectedStopName.textContent = stop.name;
  placeStopMarker(stop);
  fetchDepartures(stop);
}

async function searchStops() {
  const query = els.stopSearch.value.trim();
  if (query.length < 2) {
    els.stopResults.innerHTML = '';
    return;
  }

  els.stopResults.innerHTML = '<div class="empty-state">Otsin...</div>';
  const params = new URLSearchParams({ action: 'stops', q: query });

  try {
    const data = await fetchJson(`api.php?${params.toString()}`);
    renderStopResults(data.stops || []);
  } catch (error) {
    renderInlineError(els.stopResults, error.message);
  }
}

function renderStopResults(stops) {
  if (stops.length === 0) {
    els.stopResults.innerHTML = '<div class="empty-state">Peatust ei leitud</div>';
    return;
  }

  els.stopResults.innerHTML = stops.map((stop) => `
    <button class="stop-result" type="button" data-stop-id="${escapeHtml(stop.id)}">
      <strong>${escapeHtml(stop.name)}</strong>
      <span>${escapeHtml(stop.street || `ID ${stop.id}`)}</span>
    </button>
  `).join('');

  els.stopResults.querySelectorAll('.stop-result').forEach((button, index) => {
    button.addEventListener('click', () => {
      const stop = stops[index];
      els.stopResults.innerHTML = '';
      els.stopSearch.value = '';
      selectStop(stop);
    });
  });
}

function placeStopMarker(stop) {
  state.stopLayer.clearLayers();
  if (!stop || !stop.lat || !stop.lon) return;

  const marker = L.circleMarker([stop.lat, stop.lon], {
    pane: 'stopPane',
    radius: 8,
    color: '#0f5e62',
    weight: 3,
    fillColor: '#ffffff',
    fillOpacity: 1,
  }).addTo(state.stopLayer);

  marker.bindPopup(`
    <div class="stop-popup compact">
      <div class="stop-popup-head">
        <span>
          <strong>${escapeHtml(stop.name)}</strong>
          <small>ID ${escapeHtml(stop.id)}</small>
        </span>
        ${favoriteStopButton(stop)}
      </div>
    </div>
  `);
}

async function fetchDepartures(stop) {
  if (!stop || !stop.id) return;

  els.departures.innerHTML = '<div class="empty-state">Laen väljumisi...</div>';
  const params = new URLSearchParams({ action: 'departures', stopid: stop.id });

  try {
    const data = await fetchJson(`api.php?${params.toString()}`);
    state.departures = data.departures || [];
    renderDepartures();
    renderDelayPanel();
  } catch (error) {
    renderInlineError(els.departures, error.message);
  }
}

function renderDepartures() {
  if (state.departures.length === 0) {
    els.departures.innerHTML = '<div class="empty-state">Väljumisi ei ole</div>';
    return;
  }

  els.departures.innerHTML = state.departures.slice(0, 8).map((departure) => {
    const delayMinutes = Math.round((departure.delaySeconds || 0) / 60);
    const delayClass = delayMinutes >= 2 ? 'late' : delayMinutes <= -1 ? 'early' : '';
    const delayText = delayMinutes >= 2 ? `+${delayMinutes} min` : delayMinutes <= -1 ? `${delayMinutes} min` : 'õigeaegne';
    return `
      <article class="departure ${delayClass}">
        <span class="route-badge" style="--badge-color: ${routeColor(departure.line)}">${escapeHtml(departure.line)}</span>
        <div>
          <strong>${escapeHtml(departure.destination || '')}</strong>
          <span>${departure.scheduledTime} plaanis</span>
        </div>
        <div class="departure-time">
          <strong>${departure.minutesUntil ?? '-'} min</strong>
          <span>${departure.expectedTime} · ${delayText}</span>
        </div>
      </article>
    `;
  }).join('');
}

async function loadSchools() {
  try {
    const data = await fetchJson('api.php?action=schools');
    state.schools = data.schools || [];
    renderSchools();
    renderDelayPanel();
  } catch (error) {
    renderInlineError(els.schoolCrowds, error.message);
  }
}

function renderSchools() {
  state.schoolLayer.clearLayers();

  const crowds = state.schools
    .map((school) => ({ ...school, crowd: schoolCrowdLevel(school) }))
    .sort((a, b) => b.crowd.level - a.crowd.level);

  renderSchoolCrowdList(crowds);

  if (!state.schoolsVisible) {
    return;
  }

  state.schools.forEach((school) => {
    const crowd = schoolCrowdLevel(school);
    const nearestStop = nearestStopToSchool(school);
    const radius = crowd.level === 0 ? 7 : 12 + crowd.level * 5;
    const color = crowd.level >= 3 ? '#d94f2b' : crowd.level === 2 ? '#d98a1f' : '#d5b13f';

    L.circleMarker([school.lat, school.lon], {
      pane: 'schoolPane',
      radius,
      color,
      weight: crowd.level > 0 ? 3 : 2,
      fillColor: color,
      fillOpacity: crowd.level === 0 ? 0.16 : 0.62,
    })
      .bindPopup(`
        <div class="popup-card">
          <strong>${escapeHtml(school.name)}</strong>
          <span>${escapeHtml(crowd.label)}</span>
          <small>${escapeHtml(nearestStop ? `Liikumine peatuse poole: ${nearestStop.name}` : (school.nearStops || []).join(', '))}</small>
        </div>
      `)
      .addTo(state.schoolLayer);

    if (crowd.level > 0 && nearestStop) {
      L.polyline([[school.lat, school.lon], [nearestStop.lat, nearestStop.lon]], {
        pane: 'schoolPane',
        color,
        weight: 4,
        opacity: 0.72,
        dashArray: '5 7',
        lineCap: 'round',
      }).addTo(state.schoolLayer);
    }
  });
}

function renderSchoolCrowdList(schools) {
  const activeCrowds = schools.filter((school) => school.crowd.level > 0);

  if (activeCrowds.length === 0) {
    els.schoolCrowds.innerHTML = '<div class="empty-state">Hetkel suurt õpilasvoogu ei paista</div>';
    return;
  }

  els.schoolCrowds.innerHTML = activeCrowds.slice(0, 5).map((school) => `
    <article class="crowd-item level-${school.crowd.level}">
      <strong>${escapeHtml(school.name)}</strong>
      <span>${escapeHtml(school.crowd.label)} · ${school.crowd.level >= 3 ? 'suur voog' : school.crowd.level === 2 ? 'keskmine voog' : 'kogunemas'}</span>
    </article>
  `).join('');
}

function schoolCrowdLevel(school) {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) {
    return { level: 0, label: 'Nädalavahetus' };
  }

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  let best = { distance: Infinity, time: null };

  for (const time of school.dismissals || []) {
    const [hours, minutes] = time.split(':').map(Number);
    const endMinutes = hours * 60 + minutes;
    const distance = minutesNow - endMinutes;
    if (distance >= -5 && distance <= 45 && Math.abs(distance) < Math.abs(best.distance)) {
      best = { distance, time };
    }
  }

  if (!best.time) {
    return { level: 0, label: 'Tavaline' };
  }

  if (best.distance < 0) {
    return { level: 1, label: `Lõppemas ${best.time}` };
  }

  if (best.distance <= 15) {
    return { level: 3, label: `Tunnid lõppesid ${best.time}` };
  }

  if (best.distance <= 30) {
    return { level: 2, label: `${best.distance} min pärast lõppu` };
  }

  return { level: 1, label: `${best.distance} min pärast lõppu` };
}

function nearestStopToSchool(school) {
  if (!state.mapStops.length) {
    return null;
  }

  const preferredNames = (school.nearStops || []).map((name) => name.toLowerCase());
  const namedStop = state.mapStops.find((stop) => {
    const stopName = String(stop.name || '').toLowerCase();
    return preferredNames.some((name) => stopName.includes(name) || name.includes(stopName));
  });

  if (namedStop) {
    return namedStop;
  }

  let best = null;
  let bestDistance = Infinity;

  state.mapStops.forEach((stop) => {
    const distance = distanceMeters(school.lat, school.lon, stop.lat, stop.lon);
    if (distance < bestDistance) {
      best = stop;
      bestDistance = distance;
    }
  });

  return bestDistance <= 1200 ? best : null;
}

function nearbySchoolCrowd(lat, lon) {
  let best = null;

  state.schools.forEach((school) => {
    const crowd = schoolCrowdLevel(school);
    if (crowd.level === 0) {
      return;
    }

    const distance = distanceMeters(lat, lon, school.lat, school.lon);
    if (distance <= 750 && (!best || crowd.level > best.crowd.level || distance < best.distance)) {
      best = { school, crowd, distance };
    }
  });

  return best;
}

function distanceMeters(latA, lonA, latB, lonB) {
  const earthRadius = 6371000;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchWeather() {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=59.437&longitude=24.7536&current=temperature_2m,precipitation,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=Europe%2FTallinn';

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Ilma API ei vastanud.');
    const data = await response.json();
    renderWeather(data);
  } catch (error) {
    els.weatherText.textContent = 'Ilm puudub';
    els.walkingAdvice.textContent = error.message;
  }
}

function renderWeather(data) {
  const current = data.current || {};
  const temp = Math.round(current.temperature_2m);
  const wind = Math.round(current.wind_speed_10m || 0);
  const precipitation = Number(current.precipitation || 0);
  const code = Number(current.weather_code || 0);
  const weatherText = weatherCodeText(code);
  const advice = walkingText(temp, wind, precipitation, code);

  els.weatherTemp.textContent = `${temp}°C`;
  els.weatherText.textContent = `${weatherText}, tuul ${wind} km/h`;
  els.walkingAdvice.textContent = advice;
  els.weatherUpdated.textContent = timeNow();
}

function walkingText(temp, wind, precipitation, code) {
  if (precipitation > 0.4 || [61, 63, 65, 71, 73, 75, 80, 81, 82, 95].includes(code)) {
    return 'Buss on mugavam valik';
  }
  if (wind > 30 || temp < -8) {
    return 'Jalgsi pigem lühike ots';
  }
  return 'Jalgsi liikumine on mõistlik';
}

function weatherCodeText(code) {
  const labels = {
    0: 'Selge',
    1: 'Peamiselt selge',
    2: 'Vahelduv pilvisus',
    3: 'Pilves',
    45: 'Udu',
    48: 'Härmas udu',
    51: 'Kerge uduvihm',
    53: 'Uduvihm',
    55: 'Tihe uduvihm',
    61: 'Kerge vihm',
    63: 'Vihm',
    65: 'Tugev vihm',
    71: 'Kerge lumi',
    73: 'Lumi',
    75: 'Tugev lumi',
    80: 'Vihmahood',
    81: 'Tugevad vihmahood',
    82: 'Paduvihm',
    95: 'Äike',
  };
  return labels[code] || 'Muutlik';
}

function renderDelayPanel() {
  const lateDepartures = state.departures.filter((departure) => departure.delaySeconds >= 120);
  const riskyVehicles = state.vehicles
    .map((vehicle) => ({ vehicle, risk: vehicleDelayRisk(vehicle) }))
    .filter((item) => item.risk.level !== 'low');
  const highCount = riskyVehicles.filter((item) => item.risk.level === 'high').length
    + lateDepartures.filter((departure) => departure.delaySeconds >= 300).length;

  els.delaySummary.textContent = highCount > 0
    ? `${highCount} kõrge risk`
    : `${lateDepartures.length + riskyVehicles.length} märget`;

  const departureHtml = lateDepartures.slice(0, 3).map((departure) => `
    <article class="delay-item high">
      <strong>${escapeHtml(departure.line)} · +${Math.round(departure.delaySeconds / 60)} min</strong>
      <span>${escapeHtml(departure.destination)} · peatuse tablool juba hilineb</span>
      <i class="risk-meter" style="--risk:${Math.min(100, Math.round(departure.delaySeconds / 4))}%"></i>
    </article>
  `).join('');

  const vehicleHtml = riskyVehicles.slice(0, 4).map(({ vehicle, risk }) => `
    <article class="delay-item ${risk.level}">
      <strong>${escapeHtml(vehicle.line)} · ${escapeHtml(vehicle.id)}</strong>
      <span>${escapeHtml(risk.label)}${risk.detail ? ` · ${escapeHtml(risk.detail)}` : ''}</span>
      <i class="risk-meter" style="--risk:${risk.score * 20}%"></i>
    </article>
  `).join('');

  els.delayList.innerHTML = departureHtml + vehicleHtml || '<div class="empty-state">Olulist hilinemist ei paista</div>';
}

function vehicleDelayRisk(vehicle) {
  const age = Number(vehicle.ageSeconds || 0);
  const speed = Number(vehicle.speed || 0);
  const hour = new Date().getHours();
  const rushHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18);
  const inCenter = vehicle.lat > 59.425 && vehicle.lat < 59.455 && vehicle.lon > 24.72 && vehicle.lon < 24.79;
  const schoolCrowd = nearbySchoolCrowd(vehicle.lat, vehicle.lon);
  let score = 0;
  const reasons = [];

  if (age >= 180) {
    score += 4;
    reasons.push('GPS signaal väga vana');
  } else if (age >= 90) {
    score += 2;
    reasons.push('GPS signaal aegub');
  }

  if (rushHour && inCenter) {
    score += 2;
    reasons.push('kesklinna tipptund');
  }

  if (speed > 0 && speed < 8 && rushHour) {
    score += 2;
    reasons.push('aeglane liikumine');
  }

  if (schoolCrowd) {
    score += schoolCrowd.crowd.level;
    reasons.push(`õpilasvoog ${schoolCrowd.school.name}`);
  }

  if (score >= 4) {
    return { level: 'high', score: Math.min(5, score), label: 'Suur hilinemise oht', detail: reasons.join(', ') };
  }

  if (score >= 2) {
    return { level: 'medium', score: Math.min(5, score), label: 'Võimalik hilinemine', detail: reasons.join(', ') };
  }

  return { level: 'low', score: 1, label: 'Tavaline liikumine', detail: '' };
}

function renderLineTags() {
  if (state.selectedLines.length === 0) {
    els.selectedLines.innerHTML = '<span class="empty-tag">Ühtegi liini pole valitud</span>';
    return;
  }

  els.selectedLines.innerHTML = state.selectedLines.map((line) => {
    const color = routeColor(line);
    const emphasis = Math.round(lineEmphasis(line) * 100);
    return `
      <div class="line-control-row" data-line="${escapeHtml(line)}" style="--line-color: ${color}">
        <label class="line-color-picker" title="Muuda liini ${escapeHtml(line)} värvi">
          <span class="route-badge compact" style="--badge-color: ${color}">${escapeHtml(line)}</span>
          <input class="line-color-input" type="color" value="${escapeHtml(color)}" data-line="${escapeHtml(line)}" aria-label="Vali liini ${escapeHtml(line)} värv">
        </label>
        <label class="line-opacity-control">
          <span>Nähtavus</span>
          <input class="line-emphasis-input" type="range" min="0" max="100" step="5" value="${emphasis}" data-line="${escapeHtml(line)}" aria-label="Muuda liini ${escapeHtml(line)} nähtavust">
        </label>
        <strong class="line-emphasis-value" data-line="${escapeHtml(line)}">${emphasis}%</strong>
        <button class="line-remove" type="button" data-line="${escapeHtml(line)}" title="Eemalda liin ${escapeHtml(line)}" aria-label="Eemalda liin ${escapeHtml(line)}">
        <i data-lucide="x"></i>
      </button>
      </div>
    `;
  }).join('');

  els.selectedLines.querySelectorAll('.line-remove').forEach((button) => {
    button.addEventListener('click', () => {
      const line = button.dataset.line;
      state.selectedLines = state.selectedLines.filter((item) => item !== line);
      saveLines();
      renderLineTags();
      state.shouldFitVehicles = true;
      fetchVehicles();
      fetchRoutes();
    });
  });

  els.selectedLines.querySelectorAll('.line-color-input').forEach((input) => {
    input.addEventListener('input', () => {
      updateLineColor(input);
    });
  });

  els.selectedLines.querySelectorAll('.line-emphasis-input').forEach((input) => {
    input.addEventListener('input', () => {
      updateLineEmphasis(input);
    });
  });

  lucide.createIcons();
}

function updateLineColor(input) {
  const line = input.dataset.line;
  const color = input.value;
  if (!line || !isHexColor(color)) {
    return;
  }

  state.lineColors[line] = color;
  saveLineColors();
  syncLineColorControls(line, color);
  refreshColoredLayers(false);
}

function syncLineColorControls(line, color) {
  document.querySelectorAll(`[data-line="${cssString(line)}"]`).forEach((element) => {
    if (element.classList.contains('line-control-row')) {
      element.style.setProperty('--line-color', color);
    }

    if (element.matches('input[type="color"]')) {
      element.value = color;
      const row = element.closest('.line-control-row');
      if (row) {
        row.style.setProperty('--line-color', color);
      }

      const badge = row?.querySelector('.route-badge');
      if (badge) {
        badge.style.setProperty('--badge-color', color);
      }
    }
  });
}

function updateLineEmphasis(input) {
  const line = input.dataset.line;
  if (!line) {
    return;
  }

  const emphasis = clampNumber(Number(input.value) / 100, 0, 1);
  state.lineEmphasis[line] = emphasis;
  saveLineEmphasis();
  syncLineEmphasisControls(line, emphasis);
  refreshLineEmphasis();
}

function syncLineEmphasisControls(line, emphasis) {
  const percent = `${Math.round(emphasis * 100)}%`;
  document.querySelectorAll(`.line-emphasis-value[data-line="${cssString(line)}"]`).forEach((element) => {
    element.textContent = percent;
  });
}

function refreshColoredLayers(renderControls = true) {
  if (renderControls) {
    renderLineTags();
  }
  renderRoutes();
  renderMapStops();
  renderVehicles();
  renderDepartures();
  renderDelayPanel();
}

function refreshLineEmphasis() {
  renderRoutes();
  renderVehicles();
}

function locateUser() {
  if (!navigator.geolocation) {
    setStatus('Asukoht puudub', false);
    return;
  }

  navigator.geolocation.getCurrentPosition((position) => {
    const coords = [position.coords.latitude, position.coords.longitude];
    L.circleMarker(coords, {
      radius: 8,
      color: '#0f5e62',
      fillColor: '#0f5e62',
      fillOpacity: 0.9,
    }).addTo(state.map).bindPopup('Sinu asukoht').openPopup();
    state.map.setView(coords, 15);
  }, () => {
    setStatus('Asukoht keelatud', false);
  }, { enableHighAccuracy: true, timeout: 8000 });
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

function setStatus(text, ok) {
  els.connectionStatus.textContent = text;
  els.connectionStatus.classList.toggle('is-ok', ok);
}

function renderInlineError(container, message) {
  container.innerHTML = `<div class="empty-state error">${escapeHtml(message)}</div>`;
}

function loadLines() {
  try {
    const stored = JSON.parse(localStorage.getItem('bussradar.lines') || 'null');
    if (Array.isArray(stored) && stored.length > 0) {
      return stored.map(normalizeLine).filter(Boolean);
    }
  } catch {
    return DEFAULT_LINES;
  }

  return DEFAULT_LINES;
}

function saveLines() {
  localStorage.setItem('bussradar.lines', JSON.stringify(state.selectedLines));
  queuePreferenceSave();
}

function loadLineColors() {
  try {
    const stored = JSON.parse(localStorage.getItem('bussradar.lineColors') || '{}');
    if (stored && typeof stored === 'object') {
      return Object.fromEntries(Object.entries(stored).filter(([, color]) => isHexColor(String(color))));
    }
  } catch {
    return {};
  }

  return {};
}

function saveLineColors() {
  localStorage.setItem('bussradar.lineColors', JSON.stringify(state.lineColors));
  queuePreferenceSave();
}

function loadLineEmphasis() {
  try {
    const stored = JSON.parse(localStorage.getItem('bussradar.lineEmphasis') || '{}');
    if (stored && typeof stored === 'object') {
      return Object.fromEntries(
        Object.entries(stored)
          .map(([line, value]) => [line, clampNumber(Number(value), 0, 1)])
          .filter(([, value]) => Number.isFinite(value))
      );
    }
  } catch {
    return {};
  }

  return {};
}

function saveLineEmphasis() {
  localStorage.setItem('bussradar.lineEmphasis', JSON.stringify(state.lineEmphasis));
  queuePreferenceSave();
}

function lineEmphasis(line) {
  const value = state.lineEmphasis ? Number(state.lineEmphasis[String(line)]) : 1;
  return clampNumber(Number.isFinite(value) && value >= 0 ? value : 1, 0, 1);
}

function lineMapOpacity(line) {
  const emphasis = lineEmphasis(line);
  return emphasis <= 0 ? 0 : Math.pow(emphasis, 1.7);
}

function loadStop() {
  try {
    const stored = JSON.parse(localStorage.getItem('bussradar.stop') || 'null');
    if (stored && stored.id) return stored;
  } catch {
    return DEFAULT_STOP;
  }

  return DEFAULT_STOP;
}

function saveStop(stop) {
  localStorage.setItem('bussradar.stop', JSON.stringify(stop));
  queuePreferenceSave();
}

function loadFavoriteStops() {
  try {
    const stored = JSON.parse(localStorage.getItem('bussradar.favoriteStops') || '[]');
    if (Array.isArray(stored)) {
      return stored.filter(isStopCoordinate).map(normalizeStopForStorage);
    }
  } catch {
    return [];
  }

  return [];
}

function saveFavoriteStops() {
  localStorage.setItem('bussradar.favoriteStops', JSON.stringify(state.favoriteStops));
  queuePreferenceSave();
}

function normalizeStopForStorage(stop) {
  return {
    id: String(stop.id || ''),
    stopId: String(stop.stopId || ''),
    siriId: String(stop.siriId || ''),
    name: String(stop.name || 'Peatus'),
    street: String(stop.street || ''),
    area: String(stop.area || ''),
    city: String(stop.city || ''),
    lat: Number(stop.lat),
    lon: Number(stop.lon),
  };
}

function stopKey(stop) {
  return String(stop.stopId || stop.id || `${stop.lat},${stop.lon}`);
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function routeColor(line) {
  const text = String(line);
  if (state.lineColors && isHexColor(state.lineColors[text])) {
    return state.lineColors[text];
  }

  const preferred = {
    18: '#16a34a',
    40: '#0284c7',
    60: '#ea580c',
  };
  const palette = [
    '#0f766e',
    '#2563eb',
    '#d97706',
    '#7c3aed',
    '#db2777',
    '#059669',
    '#0891b2',
    '#ca8a04',
    '#dc2626',
    '#4f46e5',
    '#65a30d',
    '#c2410c',
    '#0d9488',
    '#9333ea',
    '#be123c',
    '#15803d',
    '#0369a1',
    '#b45309',
  ];
  let hash = 0;

  if (Object.prototype.hasOwnProperty.call(preferred, text)) {
    return preferred[text];
  }

  for (let index = 0; index < text.length; index += 1) {
    hash += text.charCodeAt(index) * (index + 3);
  }

  return palette[hash % palette.length];
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value));
}

function normalizeLine(value) {
  return value.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function vehicleKey(vehicle) {
  return `${vehicle.line}-${vehicle.id}-${vehicle.destination || ''}`;
}

function shortText(value, maxLength) {
  const text = String(value).trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function timeNow() {
  return new Intl.DateTimeFormat('et-EE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cssString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}
