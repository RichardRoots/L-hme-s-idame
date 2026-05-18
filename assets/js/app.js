const TALLINN_CENTER = [59.437, 24.7536];
const DEFAULT_LINES = ['18', '40', '60'];
const DEFAULT_STOP = { id: '1297', name: 'Laikmaa', lat: 59.43614, lon: 24.75755 };
const REFRESH_SECONDS = 10;
const WEATHER_REFRESH_MS = 10 * 60 * 1000;
const THEME_KEY = 'bussradar.theme';
const ROUTE_SIDE_STYLES = {
  south: { label: 'Lõuna pool', dashArray: null, dashOffset: '0', weight: 5, mapSide: 'south', priority: 0, sharedDash: 58, sharedGap: 0 },
  north: { label: 'Soome pool', dashArray: '1 13', dashOffset: '0', weight: 5, mapSide: 'north', priority: 1, sharedDash: 1, sharedGap: 13 },
};
const ROUTE_MAX_POINT_JUMP_METERS = 1100;
const ROUTE_SIDE_OFFSET_PX = 7;
const ROUTE_SIDE_CENTER_EPS_PX = 18;
const ROUTE_OVERLAP_DISTANCE_PX = 72;
const ROUTE_SEGMENT_HEADING_TOLERANCE = 26;
const ROUTE_DETAIL_ZOOM = 99;
const MAP_STOP_VISIBLE_ZOOM = 12;
const MAP_STOP_FULL_ZOOM = 14;
const MAP_STOP_FALLBACK_COLOR = '#063f3d';

const state = {
  map: null,
  tileLayer: null,
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
  fleet: {},
  routes: [],
  mapStops: [],
  departures: [],
  schools: [],
  schoolsVisible: false,
  shouldFitVehicles: true,
  refreshCountdown: REFRESH_SECONDS,
  refreshTimer: null,
  countdownTimer: null,
  lastWeatherFetch: 0,
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
  await loadFleetData();
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

  state.tileLayer = L.tileLayer(mapTileUrl(state.theme), {
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

  state.map.on('zoomend', () => {
    updateMapDensity();
    if (state.routes.length > 0) {
      renderRoutes();
    }
    if (state.mapStops.length > 0) {
      renderMapStops();
    }
  });
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
    const data = await fetchJson('api.html?action=authStatus');
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
  await fetchJson('api.html?action=preferences', {
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
  setMapTileTheme(normalizedTheme);
  if (state.routeLayer && state.routes.length > 0) {
    renderRoutes();
  }

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

function mapTileUrl(theme) {
  return theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
}

function setMapTileTheme(theme) {
  if (!state.tileLayer) {
    return;
  }

  state.tileLayer.setUrl(mapTileUrl(theme));
}

function loadInitialData() {
  els.selectedStopName.textContent = state.selectedStop.name;
  els.toggleSchools.classList.toggle('muted', !state.schoolsVisible);
  placeStopMarker(state.selectedStop);
  renderFavoriteStops();
  fetchRoutes();
  refreshAll();
  loadSchools();
  startRefreshLoop();
}

async function loadFleetData() {
  try {
    const response = await fetch('data/fleet.json', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Veeremiandmeid ei leitud.');
    }

    const data = await response.json();
    state.fleet = data.vehicles && typeof data.vehicles === 'object' ? data.vehicles : {};
  } catch {
    state.fleet = {};
  }
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
    const data = await fetchJson(`api.html?${params.toString()}`);
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
  const activeKeys = new Set();

  state.vehicles.forEach((vehicle) => {
    const risk = vehicleDelayRisk(vehicle);
    const key = vehicleKey(vehicle);
    const title = `Liin ${vehicle.line}`;
    const popupContent = vehiclePopup(vehicle, risk);
    const signature = vehicleIconSignature(vehicle, risk);
    activeKeys.add(key);

    let marker = state.vehicleMarkers.get(key);
    if (marker) {
      marker.setLatLng([vehicle.lat, vehicle.lon]);
      if (marker.bussRadarIconSignature !== signature) {
        marker.setIcon(vehicleIcon(vehicle, risk));
        marker.bussRadarIconSignature = signature;
      }
      updateVehicleMarkerElement(marker, vehicle);
      marker.setOpacity(1);
      marker.setPopupContent(popupContent);
      marker.options.title = title;
      marker.getElement()?.setAttribute('title', title);
      return;
    }

    marker = L.marker([vehicle.lat, vehicle.lon], {
      icon: vehicleIcon(vehicle, risk),
      pane: 'vehiclePane',
      title,
      zIndexOffset: 1000,
      opacity: 1,
    });

    marker.bussRadarIconSignature = signature;
    marker.bindPopup(popupContent);
    marker.addTo(state.vehicleLayer);
    state.vehicleMarkers.set(key, marker);
  });

  state.vehicleMarkers.forEach((marker, key) => {
    if (!activeKeys.has(key)) {
      state.vehicleLayer.removeLayer(marker);
      state.vehicleMarkers.delete(key);
    }
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

function vehicleIconSignature(vehicle, risk) {
  const profile = vehicleProfile(vehicle);
  return [
    vehicle.line,
    shortText(vehicle.destination || '', 12),
    risk.level,
    profile.badge || '',
    vehicleTypeClass(profile),
  ].join('|');
}

function updateVehicleMarkerElement(marker, vehicle) {
  const element = marker.getElement();
  if (!element) {
    return;
  }

  const color = routeColor(vehicle.line);
  const bearing = Number.isFinite(Number(vehicle.bearing)) ? Number(vehicle.bearing) : 0;
  const pin = element.querySelector('.vehicle-pin');
  if (pin) {
    pin.style.setProperty('--vehicle-color', color);
    pin.style.setProperty('--bearing', `${bearing}deg`);
  }

  const lineLabel = pin?.querySelector('strong');
  if (lineLabel) {
    lineLabel.textContent = vehicle.line;
  }

  const destination = element.querySelector('.vehicle-label');
  if (destination) {
    destination.textContent = shortText(vehicle.destination || '', 12) || vehicle.destination || 'Siht teadmata';
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
    const data = await fetchJson('api.html?action=mapStops');
    state.mapStops = data.stops || [];
    renderMapStops();
  } catch (error) {
    setStatus('Peatused puuduvad', false);
  }
}

function renderMapStops() {
  state.mapStopLayer.clearLayers();
  state.mapStopMarkers.clear();
  if (!shouldShowMapStops()) {
    return;
  }

  state.mapStops.forEach((stop) => {
    const fullSize = shouldShowFullMapStops();
    const opacity = stopMapOpacity(stop);
    if (opacity <= 0) {
      return;
    }

    const color = stopLineColor(stop) || MAP_STOP_FALLBACK_COLOR;
    const marker = L.circleMarker([stop.lat, stop.lon], {
      pane: 'mapStopPane',
      radius: fullSize ? 5.8 : 4.4,
      color: '#ffffff',
      weight: fullSize ? 2.8 : 2.3,
      fillColor: color,
      fillOpacity: opacity,
      opacity,
      className: 'map-stop-point',
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

function shouldShowMapStops() {
  return !state.map || state.map.getZoom() >= MAP_STOP_VISIBLE_ZOOM;
}

function shouldShowFullMapStops() {
  return !state.map || state.map.getZoom() >= MAP_STOP_FULL_ZOOM;
}

function stopLineColor(stop) {
  const lines = stopLines(stop);
  if (lines.length === 0) {
    return MAP_STOP_FALLBACK_COLOR;
  }

  const bestLine = lines
    .map((line) => ({ line, opacity: lineMapOpacity(line) }))
    .sort((a, b) => b.opacity - a.opacity || a.line.localeCompare(b.line, 'et', { numeric: true }))[0];

  return routeColor(bestLine.line);
}

function stopMapOpacity(stop) {
  const lines = stopLines(stop);
  if (lines.length === 0) {
    return 1;
  }

  return Math.max(...lines.map(lineMapOpacity));
}

function stopLines(stop) {
  const sourceLines = Array.isArray(stop.lines) ? stop.lines : [stop.line];
  return [...new Set(
    sourceLines
      .map((line) => normalizeLine(String(line || '')))
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, 'et', { numeric: true }));
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
    const data = await fetchJson(`api.html?${params.toString()}`);
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
    const data = await fetchJson(`api.html?${params.toString()}`);
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

  const drawableRoutes = state.routes
    .filter((route) => route.shapeQuality !== 'stops-only')
    .filter((route) => Array.isArray(route.points) && route.points.length >= 2)
    .filter((route) => lineMapOpacity(route.line) > 0);
  const styledRoutes = drawableRoutes
    .map((route) => ({ route, style: routePhysicalSideStyle(route, drawableRoutes) }))
    .sort((a, b) => a.style.priority - b.style.priority
      || String(a.route.line).localeCompare(String(b.route.line), 'et', { numeric: true }));

  if (!shouldRenderDetailedRoutes()) {
    renderOverviewRoutes(styledRoutes);
    return;
  }

  const routeSegments = routeDrawingSegments(styledRoutes);
  const routeRuns = routeDrawingRuns(routeSegments);

  routeRuns.forEach((run) => {
    renderRouteRun(run);
  });
}

function shouldRenderDetailedRoutes() {
  return state.map && state.map.getZoom() >= ROUTE_DETAIL_ZOOM;
}

function renderOverviewRoutes(styledRoutes) {
  styledRoutes.forEach(({ route, style }) => {
    let segments = routeLineSegments(route.points);
    if (routeNeedsOverviewSideOffset(route, styledRoutes)) {
      segments = offsetRouteSegments(segments, style.mapSide);
    }

    const color = routeColor(route.line);
    const emphasis = lineMapOpacity(route.line);

    L.polyline(segments, {
      pane: 'routePane',
      color: routeGapColor(),
      weight: style.weight + 3,
      opacity: style.dashArray ? 0.58 : 0.44,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: style.dashArray,
      dashOffset: style.dashOffset,
      smoothFactor: 1.5,
      interactive: false,
    }).addTo(state.routeLayer);

    const line = L.polyline(segments, {
      pane: 'routePane',
      color,
      weight: style.weight,
      opacity: 0.9 * emphasis,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: style.dashArray,
      dashOffset: style.dashOffset,
      smoothFactor: 1.5,
    }).addTo(state.routeLayer);

    line.bindTooltip(`Liin ${escapeHtml(route.line)} · ${escapeHtml(style.label)}`, {
      sticky: true,
      opacity: 0.95,
    });
  });
}

function routeNeedsOverviewSideOffset(route, styledRoutes) {
  const routeCenter = routeScreenCenter(route);
  return styledRoutes.some((entry) => {
    return entry.route !== route
      && String(entry.route.line) === String(route.line)
      && routeDirectionIndex(entry.route) % 2 !== routeDirectionIndex(route) % 2
      && layerPointDistance(routeCenter, routeScreenCenter(entry.route)) <= ROUTE_SIDE_CENTER_EPS_PX;
  });
}

function renderRouteRun(run) {
  const { pattern, points, style } = run;
  if (!pattern.isAlternating) {
    L.polyline(points, {
      pane: 'routePane',
      color: routeGapColor(),
      weight: style.weight + 4,
      opacity: style.dashArray ? 0.7 : 0.58,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: pattern.dashArray,
      dashOffset: pattern.dashOffset,
      smoothFactor: 0,
      interactive: false,
    }).addTo(state.routeLayer);
  }

  const line = L.polyline(points, {
    pane: 'routePane',
    color: run.color,
    weight: style.weight,
    opacity: run.opacity,
    lineCap: pattern.lineCap,
    lineJoin: 'round',
    dashArray: pattern.dashArray,
    dashOffset: pattern.dashOffset,
    smoothFactor: 0,
  }).addTo(state.routeLayer);

  const tooltipParts = [
    `Liin ${escapeHtml(run.line)}`,
    escapeHtml(style.label),
    run.route.name ? escapeHtml(run.route.name) : '',
  ];

  line.bindTooltip(tooltipParts.filter(Boolean).join(' · '), {
    sticky: true,
    opacity: 0.95,
  });
}

function routeDrawingSegments(styledRoutes) {
  const segments = [];

  styledRoutes.forEach(({ route, style }) => {
    routeLineSegments(route.points).forEach((routeSegment) => {
      for (let index = 1; index < routeSegment.length; index += 1) {
        const start = normalizeLatLon(routeSegment[index - 1]);
        const end = normalizeLatLon(routeSegment[index]);
        if (!start || !end || distanceMeters(start[0], start[1], end[0], end[1]) < 8) {
          continue;
        }

        segments.push({
          route,
          style,
          line: String(route.line),
          points: [start, end],
          color: routeColor(route.line),
          opacity: 0.98 * lineMapOpacity(route.line),
          direction: routeDirectionIndex(route) % 2,
          heading: routeSegmentHeadingDegrees(start, end),
          midpoint: routeSegmentMidpoint(start, end),
        });
      }
    });
  });

  return segments;
}

function routeDrawingRuns(routeSegments) {
  const prepared = routeSegments.map((segment) => {
    const pattern = routeSegmentPattern(segment, routeSegments);
    const offset = routeSegmentNeedsSideOffset(segment, routeSegments);
    const points = offset ? offsetRoutePoints(segment.points, segment.style.mapSide) : segment.points;
    return {
      ...segment,
      points,
      pattern,
      patternKey: routePatternKey(pattern),
      offset,
    };
  });

  const runs = [];
  let current = null;

  prepared.forEach((segment) => {
    if (current && canExtendRouteRun(current, segment)) {
      current.points.push(segment.points[1]);
      return;
    }

    if (current) {
      runs.push(current);
    }

    current = {
      route: segment.route,
      style: segment.style,
      line: segment.line,
      color: segment.color,
      opacity: segment.opacity,
      pattern: segment.pattern,
      patternKey: segment.patternKey,
      offset: segment.offset,
      points: [...segment.points],
    };
  });

  if (current) {
    runs.push(current);
  }

  return runs;
}

function canExtendRouteRun(run, segment) {
  if (run.route !== segment.route
    || run.line !== segment.line
    || run.style.mapSide !== segment.style.mapSide
    || run.patternKey !== segment.patternKey
    || run.offset !== segment.offset) {
    return false;
  }

  const last = run.points[run.points.length - 1];
  const next = segment.points[0];
  return routePointsTouch(last, next);
}

function routePatternKey(pattern) {
  return [
    pattern.dashArray || '',
    pattern.dashOffset || '',
    pattern.lineCap || '',
    pattern.isAlternating ? 'alt' : 'single',
  ].join('|');
}

function routePointsTouch(pointA, pointB) {
  if (!pointA || !pointB) {
    return false;
  }

  if (state.map) {
    const layerA = state.map.latLngToLayerPoint(L.latLng(pointA[0], pointA[1]));
    const layerB = state.map.latLngToLayerPoint(L.latLng(pointB[0], pointB[1]));
    return layerPointDistance(layerA, layerB) <= 8;
  }

  return distanceMeters(pointA[0], pointA[1], pointB[0], pointB[1]) < 20;
}

function routeLineSegments(points) {
  const segments = [];
  let current = [];

  points.forEach((point) => {
    const lat = Number(point?.[0]);
    const lon = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const previous = current[current.length - 1];
    if (previous && distanceMeters(previous[0], previous[1], lat, lon) > ROUTE_MAX_POINT_JUMP_METERS) {
      if (current.length >= 2) {
        segments.push(current);
      }
      current = [];
    }

    current.push([lat, lon]);
  });

  if (current.length >= 2) {
    segments.push(current);
  }

  return segments;
}

function routePhysicalSideStyle(route, routes) {
  const opposite = closestOppositeRoute(route, routes);
  if (!opposite) {
    return routeDirectionStyle(route);
  }

  const routeCenter = routeScreenCenter(route);
  const oppositeCenter = routeScreenCenter(opposite);
  if (Math.abs(routeCenter.y - oppositeCenter.y) <= ROUTE_SIDE_CENTER_EPS_PX) {
    return routeDirectionStyle(route);
  }

  return routeCenter.y <= oppositeCenter.y
    ? ROUTE_SIDE_STYLES.north
    : ROUTE_SIDE_STYLES.south;
}

function closestOppositeRoute(route, routes) {
  const direction = routeDirectionIndex(route) % 2;
  const center = routeScreenCenter(route);
  let best = null;
  let bestDistance = Infinity;

  routes.forEach((candidate) => {
    if (candidate === route || String(candidate.line) !== String(route.line)) {
      return;
    }

    if (routeDirectionIndex(candidate) % 2 === direction) {
      return;
    }

    const distance = layerPointDistance(center, routeScreenCenter(candidate));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });

  return best;
}

function routeSegmentPattern(segment, allSegments) {
  const peerLines = routeSegmentPeerLines(segment, allSegments);
  const lineIndex = Math.max(0, peerLines.indexOf(segment.line));
  const count = Math.max(1, peerLines.length);
  const isAlternating = count > 1;

  if (segment.style.dashArray) {
    const step = 13;
    return isAlternating
      ? { dashArray: `1 ${Math.max(1, step * count - 1)}`, dashOffset: String(-(lineIndex * step)), lineCap: 'round', isAlternating }
      : { dashArray: segment.style.dashArray, dashOffset: segment.style.dashOffset, lineCap: 'round', isAlternating };
  }

  if (isAlternating) {
    const dash = segment.style.sharedDash || 58;
    return {
      dashArray: `${dash} ${Math.max(1, dash * (count - 1))}`,
      dashOffset: String(-(lineIndex * dash)),
      lineCap: 'butt',
      isAlternating,
    };
  }

  return { dashArray: null, dashOffset: '0', lineCap: 'round', isAlternating };
}

function routeSegmentPeerLines(segment, allSegments) {
  const lines = new Set([segment.line]);

  allSegments.forEach((other) => {
    if (other === segment || other.style.mapSide !== segment.style.mapSide) {
      return;
    }

    if (routeHeadingDifference(segment.heading, other.heading) > ROUTE_SEGMENT_HEADING_TOLERANCE) {
      return;
    }

    if (layerPointDistance(segment.midpoint, other.midpoint) <= ROUTE_OVERLAP_DISTANCE_PX) {
      lines.add(other.line);
    }
  });

  return [...lines].sort((a, b) => a.localeCompare(b, 'et', { numeric: true }));
}

function routeSegmentNeedsSideOffset(segment, allSegments) {
  return allSegments.some((other) => {
    return other !== segment
      && other.line === segment.line
      && other.direction !== segment.direction
      && routeHeadingDifference(segment.heading, other.heading) <= ROUTE_SEGMENT_HEADING_TOLERANCE
      && layerPointDistance(segment.midpoint, other.midpoint) <= ROUTE_SIDE_CENTER_EPS_PX;
  });
}

function offsetRouteSegments(segments, mapSide) {
  if (!state.map) {
    return segments;
  }

  return segments
    .map((segment) => offsetRoutePoints(segment, mapSide))
    .filter((segment) => segment.length >= 2);
}

function offsetRoutePoints(points, mapSide) {
  const layerPoints = points.map((point) => state.map.latLngToLayerPoint(L.latLng(point[0], point[1])));

  return layerPoints.map((point, index) => {
    const previous = layerPoints[index - 1];
    const next = layerPoints[index + 1];
    const normalA = previous ? segmentNormal(previous, point) : null;
    const normalB = next ? segmentNormal(point, next) : null;
    const normal = averageNormal(normalA, normalB);
    const direction = mapSideOffsetDirection(normal, mapSide);
    const shifted = L.point(
      point.x + normal.x * ROUTE_SIDE_OFFSET_PX * direction,
      point.y + normal.y * ROUTE_SIDE_OFFSET_PX * direction,
    );
    const latLng = state.map.layerPointToLatLng(shifted);
    return [latLng.lat, latLng.lng];
  });
}

function mapSideOffsetDirection(normal, mapSide) {
  const wantedY = mapSide === 'north' ? -1 : 1;
  if (Math.abs(normal.y) < 0.08) {
    return mapSide === 'north' ? 1 : -1;
  }

  return wantedY * Math.sign(normal.y);
}

function segmentNormal(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) {
    return { x: 0, y: 0 };
  }

  return { x: -dy / length, y: dx / length };
}

function averageNormal(normalA, normalB) {
  const x = (normalA?.x || 0) + (normalB?.x || 0);
  const y = (normalA?.y || 0) + (normalB?.y || 0);
  const length = Math.hypot(x, y);
  if (length) {
    return { x: x / length, y: y / length };
  }

  return normalA || normalB || { x: 0, y: 0 };
}

function routeScreenCenter(route) {
  const points = Array.isArray(route.points) ? route.points : [];
  if (points.length === 0) {
    return L.point(0, 0);
  }

  const sampleStep = Math.max(1, Math.floor(points.length / 24));
  let x = 0;
  let y = 0;
  let count = 0;

  for (let index = 0; index < points.length; index += sampleStep) {
    const point = points[index];
    const lat = Number(point?.[0]);
    const lon = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const layerPoint = state.map
      ? state.map.latLngToLayerPoint(L.latLng(lat, lon))
      : L.point(lon * 100000, lat * -100000);
    x += layerPoint.x;
    y += layerPoint.y;
    count += 1;
  }

  return count ? L.point(x / count, y / count) : L.point(0, 0);
}

function routeSegmentMidpoint(start, end) {
  const lat = (start[0] + end[0]) / 2;
  const lon = (start[1] + end[1]) / 2;
  if (state.map) {
    return state.map.latLngToLayerPoint(L.latLng(lat, lon));
  }

  return L.point(lon * 100000, lat * -100000);
}

function routeOverallHeading(route) {
  const points = Array.isArray(route.points) ? route.points : [];
  const start = points.find(normalizeLatLon);
  const end = [...points].reverse().find(normalizeLatLon);
  if (!start || !end) {
    return 0;
  }

  return routeSegmentHeadingDegrees(start, end);
}

function normalizeLatLon(point) {
  const lat = Number(point?.[0]);
  const lon = Number(point?.[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

function routeSegmentHeadingDegrees(start, end) {
  const lat = (start[0] + end[0]) / 2;
  const lonMeters = Math.max(25000, 111320 * Math.cos(lat * Math.PI / 180));
  const dx = (end[1] - start[1]) * lonMeters;
  const dy = (end[0] - start[0]) * 111320;
  return (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 180;
}

function routeHeadingDifference(a, b) {
  const diff = Math.abs(Number(a) - Number(b)) % 180;
  return Math.min(diff, 180 - diff);
}

function layerPointDistance(pointA, pointB) {
  if (!pointA || !pointB) {
    return Infinity;
  }

  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function routeGapColor() {
  return state.theme === 'dark' ? '#1e2a28' : '#ffffff';
}

function routeDirectionStyle(route) {
  return routeDirectionIndex(route) % 2 === 1
    ? ROUTE_SIDE_STYLES.north
    : ROUTE_SIDE_STYLES.south;
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
  const riskBadge = risk.level === 'high' || risk.level === 'medium'
    ? '<span class="vehicle-risk-badge" aria-hidden="true">!</span>'
    : '';
  const profile = vehicleProfile(vehicle);
  const typeClass = vehicleTypeClass(profile);
  const typeBadge = profile.badge
    ? `<span class="vehicle-type-badge ${typeClass}" title="${escapeHtml(profile.shortLabel)}">${escapeHtml(profile.badge)}</span>`
    : '';
  const destination = shortText(vehicle.destination || '', 12);
  const color = routeColor(vehicle.line);
  const bearing = Number.isFinite(Number(vehicle.bearing)) ? Number(vehicle.bearing) : 0;
  return L.divIcon({
    className: `vehicle-marker ${riskClass} ${typeClass}`,
    html: `
      <div class="vehicle-icon-wrap">
        <div class="vehicle-pin" style="--vehicle-color: ${color}; --bearing: ${bearing}deg;">
          <span class="vehicle-pulse" aria-hidden="true"></span>
          <span class="vehicle-arrow" aria-hidden="true"><i></i></span>
          <strong>${escapeHtml(vehicle.line)}</strong>
          ${riskBadge}
        </div>
        ${typeBadge}
        <span class="vehicle-label">${escapeHtml(destination || vehicle.destination || 'Siht teadmata')}</span>
      </div>
    `,
    iconSize: [112, 108],
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
    const profile = vehicleProfile(vehicle);
    return `
      <button class="vehicle-row ${riskClass}" type="button" data-vehicle-key="${escapeHtml(vehicleKey(vehicle))}">
        <span class="route-badge compact" style="--badge-color: ${routeColor(vehicle.line)}">${escapeHtml(vehicle.line)}</span>
        <span class="vehicle-row-text">
          <strong>${escapeHtml(vehicle.destination || 'Siht teadmata')}</strong>
          <span class="vehicle-type-chip ${profile.isElectric ? 'electric' : ''} ${profile.isArticulated ? 'articulated' : ''} ${profile.isKnown ? '' : 'unknown'}">
            ${escapeHtml(profile.shortLabel)}
          </span>
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
  const profile = vehicleProfile(vehicle);
  const fleetInfo = vehicleFleetInfoHtml(profile);
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
      ${fleetInfo}
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
    const data = await fetchJson(`api.html?${params.toString()}`);
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
    const data = await fetchJson(`api.html?${params.toString()}`);
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
    const data = await fetchJson(`api.html?${params.toString()}`);
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
    const data = await fetchJson('api.html?action=schools');
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
  const now = Date.now();
  if (state.lastWeatherFetch && now - state.lastWeatherFetch < WEATHER_REFRESH_MS) {
    return;
  }
  state.lastWeatherFetch = now;
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

function vehicleProfile(vehicle) {
  const id = String(vehicle.id || '').trim();
  const fleet = state.fleet[id];

  if (!fleet) {
    return {
      isKnown: false,
      isElectric: false,
      isArticulated: false,
      badge: '',
      shortLabel: 'Info puudub',
      facts: [],
    };
  }

  const isElectric = fleet.power === 'electric' || fleet.isElectric === true;
  const isArticulated = fleet.size === 'articulated' || fleet.isArticulated === true;
  const sizeLabel = vehicleSizeLabel(fleet);
  const powerLabel = vehiclePowerLabel(fleet);
  const facts = vehicleFacts(fleet, sizeLabel, powerLabel);

  return {
    isKnown: true,
    isElectric,
    isArticulated,
    badge: vehicleTypeBadge(fleet, isElectric, isArticulated),
    shortLabel: facts.length ? facts.slice(0, 2).map((fact) => fact.label).join(' · ') : 'Info puudub',
    sizeLabel,
    powerLabel,
    facts,
  };
}

function vehicleTypeBadge(fleet, isElectric, isArticulated) {
  if (isElectric) {
    return 'E';
  }

  return '';
}

function vehicleTypeClass(profile) {
  if (profile.isElectric) {
    return 'type-electric';
  }

  if (profile.isArticulated) {
    return 'type-articulated';
  }

  return profile.isKnown ? 'type-standard' : 'type-unknown';
}

function vehicleSizeLabel(fleet) {
  if (fleet.size === 'articulated') {
    return 'Pikk buss';
  }

  if (fleet.size === 'standard') {
    return 'Lühike buss';
  }

  return '';
}

function vehiclePowerLabel(fleet) {
  if (fleet.power === 'electric') {
    return 'Elektriga';
  }

  if (fleet.power === 'hybrid') {
    return 'Hübriid';
  }

  if (fleet.power === 'cng') {
    return 'Gaasiga';
  }

  if (fleet.power === 'diesel') {
    return 'Kütusega';
  }

  return '';
}

function vehicleFacts(fleet, sizeLabel, powerLabel) {
  const facts = [];

  if (sizeLabel) {
    facts.push({ icon: 'ruler', label: sizeLabel });
  }

  if (powerLabel) {
    facts.push({ icon: vehiclePowerIcon(fleet.power), label: powerLabel });
  }

  return facts;
}

function vehiclePowerIcon(power) {
  if (power === 'electric') {
    return 'zap';
  }

  if (power === 'hybrid') {
    return 'leaf';
  }

  if (power === 'cng') {
    return 'zap';
  }

  return 'fuel';
}

function vehicleFleetInfoHtml(profile) {
  if (!profile.isKnown || profile.facts.length === 0) {
    return `
      <div class="vehicle-facts is-missing">
        <span class="vehicle-fact">
          <i data-lucide="info"></i>
          <strong>Info puudub</strong>
        </span>
      </div>
    `;
  }

  return `
    <div class="vehicle-facts">
      ${profile.facts.map((fact) => `
        <span class="vehicle-fact">
          <i data-lucide="${escapeHtml(fact.icon)}"></i>
          <strong>${escapeHtml(fact.label)}</strong>
        </span>
      `).join('')}
    </div>
  `;
}

function renderLineTags() {
  if (state.selectedLines.length === 0) {
    els.selectedLines.innerHTML = '<span class="empty-tag">Ühtegi liini pole valitud</span>';
    return;
  }

  els.selectedLines.innerHTML = state.selectedLines.map((line) => {
    const color = routeColor(line);
    const emphasis = Math.round(lineEmphasis(line) * 100);
    const sliderShellStyle = lineSliderShellStyle(color, emphasis);
    const sliderInputStyle = lineSliderInputStyle(color, emphasis);
    const sliderTrackStyle = lineSliderTrackStyle(color);
    const sliderFillStyle = lineSliderFillStyle(color, emphasis);
    const sliderThumbStyle = lineSliderThumbStyle(color, emphasis);
    return `
      <div class="line-control-row" data-line="${escapeHtml(line)}" style="--line-color: ${color}; --line-emphasis: ${emphasis}%">
        <label class="line-color-picker" title="Muuda liini ${escapeHtml(line)} värvi">
          <span class="route-badge compact" style="--badge-color: ${color}">${escapeHtml(line)}</span>
          <input class="line-color-input" type="color" value="${escapeHtml(color)}" data-line="${escapeHtml(line)}" aria-label="Vali liini ${escapeHtml(line)} värv">
        </label>
        <label class="line-opacity-control">
          <span>Nähtavus</span>
          <span class="line-slider-shell" style="${escapeHtml(sliderShellStyle)}">
            <input class="line-emphasis-input" type="range" min="0" max="100" step="5" value="${emphasis}" data-line="${escapeHtml(line)}" style="${escapeHtml(sliderInputStyle)}" aria-label="Muuda liini ${escapeHtml(line)} nähtavust">
            <span class="line-slider-track" style="${escapeHtml(sliderTrackStyle)}" aria-hidden="true">
              <span class="line-slider-fill" style="${escapeHtml(sliderFillStyle)}"></span>
            </span>
            <span class="line-slider-thumb" style="${escapeHtml(sliderThumbStyle)}" aria-hidden="true"></span>
          </span>
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

    if (element.classList.contains('line-emphasis-input')) {
      applyLineSliderStyle(element, color, Number(element.value));
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
  document.querySelectorAll(`.line-control-row[data-line="${cssString(line)}"]`).forEach((element) => {
    element.style.setProperty('--line-emphasis', percent);
  });
  document.querySelectorAll(`.line-emphasis-input[data-line="${cssString(line)}"]`).forEach((input) => {
    const value = Math.round(emphasis * 100);
    input.value = String(value);
    applyLineSliderStyle(input, routeColor(line), value);
  });
  document.querySelectorAll(`.line-emphasis-value[data-line="${cssString(line)}"]`).forEach((element) => {
    element.textContent = percent;
  });
}

function applyLineSliderStyle(input, color, value) {
  const sliderColor = isHexColor(color) ? color : routeColor(input.dataset.line || '');
  const percent = clampNumber(Number(value), 0, 100);
  const shell = input.closest('.line-slider-shell');
  shell?.setAttribute('style', lineSliderShellStyle(sliderColor, percent));
  input.setAttribute('style', lineSliderInputStyle(sliderColor, percent));
  shell?.querySelector('.line-slider-track')?.setAttribute('style', lineSliderTrackStyle(sliderColor));
  shell?.querySelector('.line-slider-fill')?.setAttribute('style', lineSliderFillStyle(sliderColor, percent));
  shell?.querySelector('.line-slider-thumb')?.setAttribute('style', lineSliderThumbStyle(sliderColor, percent));
}

function lineSliderVariables(color, value) {
  const sliderColor = isHexColor(color) ? color : '#0f766e';
  const percent = clampNumber(Number(value), 0, 100);
  return `--line-color: ${sliderColor}; --line-emphasis: ${percent}%;`;
}

function lineSliderShellStyle(color, value) {
  return `${lineSliderVariables(color, value)} position: relative; width: 100%; min-width: 0; height: 22px; display: block;`;
}

function lineSliderInputStyle(color, value) {
  return `${lineSliderVariables(color, value)} position: absolute; inset: 0; z-index: 3; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; background: transparent; border: 0; border-radius: 999px; outline: none; -webkit-appearance: none; appearance: none;`;
}

function lineSliderTrackStyle(color) {
  return 'position: absolute; left: 0; right: 0; top: 50%; z-index: 1; height: 6px; overflow: hidden; box-sizing: border-box; border: 1px solid rgba(15, 23, 42, 0.24); border-radius: 999px; background: #ffffff; transform: translateY(-50%);';
}

function lineSliderFillStyle(color, value) {
  const sliderColor = isHexColor(color) ? color : '#0f766e';
  const percent = clampNumber(Number(value), 0, 100);
  return `width: ${percent}%; height: 100%; display: block; border-radius: inherit; background: ${sliderColor};`;
}

function lineSliderThumbStyle(color, value) {
  const sliderColor = isHexColor(color) ? color : '#0f766e';
  const percent = clampNumber(Number(value), 0, 100);
  return `position: absolute; left: clamp(8px, ${percent}%, calc(100% - 8px)); top: 50%; z-index: 2; width: 16px; height: 16px; border: 2px solid #ffffff; border-radius: 999px; background: ${sliderColor}; box-shadow: 0 2px 7px rgba(18, 34, 31, 0.26); pointer-events: none; transform: translate(-50%, -50%);`;
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
  renderMapStops();
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
