const TALLINN_CENTER = [59.437, 24.7536];
const DEFAULT_LINES = ['18', '40', '60'];
const DEFAULT_STOP = { id: '1297', name: 'Laikmaa', lat: 59.43614, lon: 24.75755 };
const REFRESH_SECONDS = 10;
const WEATHER_REFRESH_MS = 10 * 60 * 1000;
const GPS_REFRESH_MS = 5000;
const THEME_KEY = 'bussradar.theme';
const ONBOARDING_KEY = 'bussradar.onboardingSeen.v1';
const TRANSFER_STOP_KEY = 'bussradar.transferStop';
const TRANSFER_TARGET_LINE_KEY = 'bussradar.transferTargetLine';
const TRANSFER_WALK_BUFFER_MINUTES = 2;
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
  scheduleStopHighlightLayer: null,
  transferStopLayer: null,
  favoriteStopLayer: null,
  vehicleMarkers: new Map(),
  mapStopMarkers: new Map(),
  favoriteStopMarkers: new Map(),
  selectedLines: loadLines(),
  lineColors: loadLineColors(),
  lineEmphasis: loadLineEmphasis(),
  selectedStop: loadStop(),
  scheduleAvailableLines: [],
  scheduleLine: loadScheduleLine(),
  scheduleRoutes: [],
  scheduleRouteIndex: 0,
  scheduleStopIndex: 0,
  scheduleSelectedTripKey: '',
  scheduleRequestId: 0,
  favoriteStops: loadFavoriteStops(),
  vehicles: [],
  fleet: {},
  fleetAliases: new Map(),
  routes: [],
  mapStops: [],
  departures: [],
  delayScheduleRoutes: new Map(),
  transfer: {
    currentVehicleKey: '',
    targetVehicleKey: '',
    targetLine: loadTransferTargetLine(),
    targetDepartureKey: '',
    stop: loadTransferStop(),
    departures: [],
    loadingDepartures: false,
    departureError: '',
    departureRequestId: 0,
    popupExpanded: false,
  },
  schools: [],
  schoolsVisible: false,
  shouldFitVehicles: true,
  refreshCountdown: REFRESH_SECONDS,
  refreshTimer: null,
  countdownTimer: null,
  refreshRequestId: 0,
  lastWeatherFetch: 0,
  deferredInstallPrompt: null,
  user: null,
  theme: loadTheme(),
  preferenceSaveTimer: null,
  sidePanelHeight: 0,
  userLocationMarker: null,
  userLocationAccuracyCircle: null,
  userLocationTimer: null,
  userLocationActive: false,
  userLocationPending: false,
  onboarding: {
    active: false,
    index: 0,
    steps: [],
  },
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
  queueFirstVisitOnboarding();
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
  els.helpButton = document.querySelector('#helpButton');
  els.installButton = document.querySelector('#installButton');
  els.themeToggle = document.querySelector('#themeToggle');
  els.accountLink = document.querySelector('#accountLink');
  els.authButtonText = document.querySelector('#authButtonText');
  els.schedulePanel = document.querySelector('#schedulePanel');
  els.schedulePanelDrag = document.querySelector('#schedulePanelDrag');
  els.scheduleToggle = document.querySelector('#scheduleToggle');
  els.scheduleClose = document.querySelector('#scheduleClose');
  els.workspace = document.querySelector('.workspace');
  els.sidePanel = document.querySelector('.side-panel');
  els.panelCollapseToggle = document.querySelector('#panelCollapseToggle');
  els.stopSearchForm = document.querySelector('#stopSearchForm');
  els.stopSearch = document.querySelector('#stopSearch');
  els.stopResults = document.querySelector('#stopResults');
  els.selectedStopName = document.querySelector('#selectedStopName');
  els.departures = document.querySelector('#departures');
  els.transferSummary = document.querySelector('#transferSummary');
  els.transferCurrentVehicle = document.querySelector('#transferCurrentVehicle');
  els.transferStopForm = document.querySelector('#transferStopForm');
  els.transferStopSearch = document.querySelector('#transferStopSearch');
  els.transferStopResults = document.querySelector('#transferStopResults');
  els.transferTargetVehicle = document.querySelector('#transferTargetVehicle');
  els.transferTargetLine = document.querySelector('#transferTargetLine');
  els.transferTargetDeparture = document.querySelector('#transferTargetDeparture');
  els.transferCalculate = document.querySelector('#transferCalculate');
  els.transferResult = document.querySelector('#transferResult');
  els.scheduleForm = document.querySelector('#scheduleForm');
  els.scheduleLineSelect = document.querySelector('#scheduleLineSelect');
  els.scheduleDirectionSelect = document.querySelector('#scheduleDirectionSelect');
  els.scheduleSummary = document.querySelector('#scheduleSummary');
  els.scheduleDirections = document.querySelector('#scheduleDirections');
  els.scheduleList = document.querySelector('#scheduleList');
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
  state.map.createPane('scheduleStopPane');
  state.map.createPane('transferStopPane');
  state.map.createPane('favoriteStopPane');
  state.map.createPane('vehiclePane');
  state.map.getPane('routePane').style.zIndex = 405;
  state.map.getPane('schoolPane').style.zIndex = 410;
  state.map.getPane('mapStopPane').style.zIndex = 500;
  state.map.getPane('stopPane').style.zIndex = 520;
  state.map.getPane('scheduleStopPane').style.zIndex = 585;
  state.map.getPane('transferStopPane').style.zIndex = 595;
  state.map.getPane('favoriteStopPane').style.zIndex = 560;
  state.map.getPane('vehiclePane').style.zIndex = 690;

  state.routeLayer = L.layerGroup().addTo(state.map);
  state.schoolLayer = L.layerGroup().addTo(state.map);
  state.mapStopLayer = L.layerGroup().addTo(state.map);
  state.stopLayer = L.layerGroup().addTo(state.map);
  state.scheduleStopHighlightLayer = L.layerGroup().addTo(state.map);
  state.transferStopLayer = L.layerGroup().addTo(state.map);
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

function setMobilePanelCollapsed(collapsed) {
  els.sidePanel?.classList.toggle('is-collapsed', collapsed);
  els.workspace?.classList.toggle('panel-collapsed', collapsed);

  if (els.panelCollapseToggle) {
    els.panelCollapseToggle.setAttribute('aria-expanded', String(!collapsed));
    els.panelCollapseToggle.setAttribute('aria-label', collapsed ? 'Ava paneel' : 'Peida paneel');
    els.panelCollapseToggle.title = collapsed ? 'Ava paneel' : 'Lohista paneeli kõrgust';
    if (!els.panelCollapseToggle.querySelector('span')) {
      els.panelCollapseToggle.innerHTML = '<span aria-hidden="true"></span>';
    }
  }

  if (els.workspace && isMobileSidePanelLayout()) {
    const { collapsedHeight, minOpenHeight, maxHeight } = sidePanelHeightBounds();
    if (collapsed) {
      const currentHeight = els.sidePanel?.getBoundingClientRect().height || 0;
      if (currentHeight > collapsedHeight + 24) {
        state.sidePanelHeight = Math.round(clampNumber(currentHeight, minOpenHeight, maxHeight));
      }
      els.workspace.style.setProperty('--side-panel-height', `${collapsedHeight}px`);
    } else {
      const openHeight = clampNumber(state.sidePanelHeight || minOpenHeight, minOpenHeight, maxHeight);
      state.sidePanelHeight = openHeight;
      els.workspace.style.setProperty('--side-panel-height', `${Math.round(openHeight)}px`);
    }
  } else {
    els.workspace?.style.removeProperty('--side-panel-height');
  }

  window.setTimeout(() => state.map?.invalidateSize({ animate: false }), 220);
}

function isMobileSidePanelLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function sidePanelHeightBounds() {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
  const workspaceHeight = els.workspace?.getBoundingClientRect().height || Math.max(420, viewportHeight - 60);
  const collapsedHeight = window.matchMedia('(max-width: 520px)').matches ? 54 : 56;
  const visibleMapStrip = window.matchMedia('(max-width: 520px)').matches ? 16 : 24;
  const minOpenHeight = clampNumber(Math.round(viewportHeight * 0.36), 260, 360);
  const absoluteMaxHeight = Math.max(minOpenHeight, workspaceHeight - visibleMapStrip);
  const maxHeight = Math.max(minOpenHeight, Math.min(Math.round(workspaceHeight * 0.98), absoluteMaxHeight));
  return { collapsedHeight, minOpenHeight, maxHeight };
}

function setSidePanelHeight(height, { allowCollapsed = false, remember = true } = {}) {
  if (!els.workspace || !els.sidePanel) {
    return;
  }

  if (!isMobileSidePanelLayout()) {
    els.workspace.style.removeProperty('--side-panel-height');
    return;
  }

  const { collapsedHeight, minOpenHeight, maxHeight } = sidePanelHeightBounds();
  const minHeight = allowCollapsed ? collapsedHeight : minOpenHeight;
  const nextHeight = clampNumber(Number(height), minHeight, maxHeight);
  els.workspace.style.setProperty('--side-panel-height', `${Math.round(nextHeight)}px`);

  if (remember && nextHeight > collapsedHeight + 24) {
    state.sidePanelHeight = Math.round(nextHeight);
  }

  state.map?.invalidateSize({ animate: false });
}

function clampSidePanelHeight() {
  if (!els.workspace || !els.sidePanel || !isMobileSidePanelLayout()) {
    els.workspace?.style.removeProperty('--side-panel-height');
    els.workspace?.classList.remove('panel-collapsed');
    els.workspace?.classList.remove('panel-resizing');
    els.sidePanel?.classList.remove('is-collapsed');
    return;
  }

  if (els.sidePanel.classList.contains('is-collapsed')) {
    setMobilePanelCollapsed(true);
    return;
  }

  const currentHeight = els.sidePanel.getBoundingClientRect().height;
  if (currentHeight > 0) {
    setSidePanelHeight(currentHeight);
  }
}

function startSidePanelDrag(event) {
  if (!isMobileSidePanelLayout() || !els.sidePanel || !els.workspace) {
    return;
  }

  event.preventDefault();
  const pointerId = event.pointerId;
  const startY = event.clientY;
  const startedCollapsed = els.sidePanel.classList.contains('is-collapsed');
  const { collapsedHeight, minOpenHeight } = sidePanelHeightBounds();
  const measuredHeight = els.sidePanel.getBoundingClientRect().height;
  const startHeight = startedCollapsed
    ? collapsedHeight
    : measuredHeight || state.sidePanelHeight || minOpenHeight;
  let moved = false;
  let latestHeight = startHeight;

  els.workspace.classList.add('panel-resizing');
  els.panelCollapseToggle?.setAttribute('aria-pressed', 'true');
  try {
    els.panelCollapseToggle?.setPointerCapture?.(pointerId);
  } catch {
    // Pointer capture is a convenience; window listeners still keep the drag usable.
  }

  const movePanel = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) {
      return;
    }

    const delta = startY - moveEvent.clientY;
    if (Math.abs(delta) > 6) {
      moved = true;
    }

    latestHeight = startHeight + delta;
    if (latestHeight <= collapsedHeight + 24) {
      els.sidePanel.classList.remove('is-collapsed');
      els.workspace.classList.remove('panel-collapsed');
      setSidePanelHeight(collapsedHeight, { allowCollapsed: true, remember: false });
      return;
    }

    els.sidePanel.classList.remove('is-collapsed');
    els.workspace.classList.remove('panel-collapsed');
    setSidePanelHeight(latestHeight);
  };

  const stopDrag = (upEvent) => {
    if (upEvent.pointerId !== pointerId) {
      return;
    }

    window.removeEventListener('pointermove', movePanel);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
    els.workspace?.classList.remove('panel-resizing');
    els.panelCollapseToggle?.setAttribute('aria-pressed', 'false');
    try {
      els.panelCollapseToggle?.releasePointerCapture?.(pointerId);
    } catch {
      // It may not have been captured.
    }

    if (!moved) {
      setMobilePanelCollapsed(!startedCollapsed);
    } else if (latestHeight <= collapsedHeight + 30) {
      setMobilePanelCollapsed(true);
    } else {
      setMobilePanelCollapsed(false);
      setSidePanelHeight(latestHeight);
    }

    window.setTimeout(() => state.map?.invalidateSize({ animate: false }), 80);
  };

  window.addEventListener('pointermove', movePanel);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
}

function setSchedulePanelOpen(open) {
  els.schedulePanel?.classList.toggle('is-open', open);
  els.schedulePanel?.setAttribute('aria-hidden', String(!open));
  els.scheduleToggle?.classList.toggle('is-active', open);
  els.scheduleToggle?.setAttribute('aria-expanded', String(open));

  if (!open) {
    clearScheduleStopHighlight();
  }

  if (open && state.scheduleRoutes.length === 0) {
    fetchSchedule();
  }

  window.setTimeout(() => state.map?.invalidateSize({ animate: false }), 180);
}

function isMobileScheduleLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function schedulePanelHeightBounds() {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
  const minHeight = clampNumber(Math.round(viewportHeight * 0.32), 210, 320);
  const maxHeight = Math.max(minHeight + 90, Math.min(Math.round(viewportHeight * 0.82), viewportHeight - 92));
  return { minHeight, maxHeight };
}

function setSchedulePanelHeight(height) {
  if (!els.schedulePanel) {
    return;
  }

  if (!isMobileScheduleLayout()) {
    els.schedulePanel.style.removeProperty('--schedule-panel-height');
    return;
  }

  const { minHeight, maxHeight } = schedulePanelHeightBounds();
  const nextHeight = clampNumber(Number(height), minHeight, maxHeight);
  els.schedulePanel.style.setProperty('--schedule-panel-height', `${Math.round(nextHeight)}px`);
  state.map?.invalidateSize({ animate: false });
}

function clampSchedulePanelHeight() {
  if (!els.schedulePanel || !isMobileScheduleLayout()) {
    els.schedulePanel?.style.removeProperty('--schedule-panel-height');
    return;
  }

  const currentHeight = els.schedulePanel.getBoundingClientRect().height;
  if (currentHeight > 0) {
    setSchedulePanelHeight(currentHeight);
  }
}

function startSchedulePanelDrag(event) {
  if (!isMobileScheduleLayout() || !els.schedulePanel) {
    return;
  }

  event.preventDefault();
  const pointerId = event.pointerId;
  const startY = event.clientY;
  const startHeight = els.schedulePanel.getBoundingClientRect().height;

  els.schedulePanel.classList.add('is-resizing');
  els.schedulePanelDrag?.setAttribute('aria-pressed', 'true');
  try {
    els.schedulePanelDrag?.setPointerCapture?.(pointerId);
  } catch {
    // Capture can fail on older touch stacks; window listeners still handle the drag.
  }

  const movePanel = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) {
      return;
    }
    setSchedulePanelHeight(startHeight + startY - moveEvent.clientY);
  };

  const stopDrag = (upEvent) => {
    if (upEvent.pointerId !== pointerId) {
      return;
    }

    window.removeEventListener('pointermove', movePanel);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
    els.schedulePanel?.classList.remove('is-resizing');
    els.schedulePanelDrag?.setAttribute('aria-pressed', 'false');
    try {
      els.schedulePanelDrag?.releasePointerCapture?.(pointerId);
    } catch {
      // It may not have been captured.
    }
    window.setTimeout(() => state.map?.invalidateSize({ animate: false }), 80);
  };

  window.addEventListener('pointermove', movePanel);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
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

  els.helpButton?.addEventListener('click', () => {
    startOnboarding({ force: true });
  });

  els.lineForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = normalizeLine(els.lineInput.value);
    if (!value) return;

    if (!state.selectedLines.includes(value)) {
      state.selectedLines.push(value);
      saveLines();
      renderLineTags();
      renderScheduleLineOptions();
      state.shouldFitVehicles = true;
      fetchVehicles();
      fetchRoutes();
    }

    els.lineInput.value = '';
  });

  els.refreshButton.addEventListener('click', () => {
    refreshAll();
  });

  els.scheduleToggle?.addEventListener('click', () => {
    setSchedulePanelOpen(!els.schedulePanel?.classList.contains('is-open'));
  });

  els.scheduleClose?.addEventListener('click', () => {
    setSchedulePanelOpen(false);
  });

  els.schedulePanelDrag?.addEventListener('pointerdown', startSchedulePanelDrag);

  els.locateButton.addEventListener('click', () => {
    locateUser();
  });

  els.panelCollapseToggle?.addEventListener('pointerdown', startSidePanelDrag);

  els.stopSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    searchStops();
  });

  els.transferCurrentVehicle?.addEventListener('change', () => {
    setTransferCurrentVehicle(els.transferCurrentVehicle.value);
  });

  els.transferStopForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    searchTransferStops();
  });

  els.transferTargetVehicle?.addEventListener('change', () => {
    setTransferTargetVehicle(els.transferTargetVehicle.value);
  });

  els.transferTargetLine?.addEventListener('input', () => {
    setTransferTargetLine(els.transferTargetLine.value);
  });

  els.transferTargetDeparture?.addEventListener('change', () => {
    state.transfer.targetDepartureKey = els.transferTargetDeparture.value;
    updateTransferResult();
    refreshVehiclePopupContents();
  });

  els.transferCalculate?.addEventListener('click', () => {
    refreshTransferEstimate();
  });

  els.scheduleForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    selectScheduleLine(els.scheduleLineSelect?.value || state.scheduleLine);
  });

  els.scheduleLineSelect?.addEventListener('change', () => {
    selectScheduleLine(els.scheduleLineSelect.value);
  });

  els.scheduleDirectionSelect?.addEventListener('change', () => {
    state.scheduleRouteIndex = clampNumber(Number(els.scheduleDirectionSelect.value || 0), 0, Math.max(0, state.scheduleRoutes.length - 1));
    state.scheduleStopIndex = 0;
    state.scheduleSelectedTripKey = '';
    clearScheduleStopHighlight();
    renderScheduleDirections();
    renderScheduleRoute();
  });

  document.addEventListener('click', handleFavoritePopupClick);
  document.addEventListener('click', handleTransferActionClick);
  document.addEventListener('click', handleInstallHelpClick);
  document.addEventListener('click', handleOnboardingClick);

  document.addEventListener('keydown', (event) => {
    if (state.onboarding.active) {
      if (event.key === 'Escape') {
        event.preventDefault();
        completeOnboarding();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextOnboardingStep();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previousOnboardingStep();
        return;
      }
    }
    if (event.key === 'Escape' && els.schedulePanel?.classList.contains('is-open')) {
      setSchedulePanelOpen(false);
    }
    if (event.key === 'Escape') {
      hideInstallHelp();
    }
  });

  els.favoriteStopForm.addEventListener('submit', (event) => {
    event.preventDefault();
    searchFavoriteStops();
  });

  els.toggleSchools.addEventListener('click', () => {
    state.schoolsVisible = !state.schoolsVisible;
    renderSchools();
    els.toggleSchools.classList.toggle('muted', !state.schoolsVisible);
  });

  els.installButton?.addEventListener('click', async () => {
    if (state.deferredInstallPrompt) {
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      updateInstallButtonVisibility();
      return;
    }

    showInstallHelp();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    updateInstallButtonVisibility();
  });

  window.addEventListener('appinstalled', () => {
    state.deferredInstallPrompt = null;
    updateInstallButtonVisibility();
  });

  window.setTimeout(updateInstallButtonVisibility, 700);

  window.addEventListener('resize', () => {
    clampSchedulePanelHeight();
    clampSidePanelHeight();
    positionOnboarding();
    window.setTimeout(() => state.map?.invalidateSize({ animate: false }), 120);
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
  renderScheduleLineOptions();
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalizedTheme === 'dark' ? '#0b0f14' : '#0f5e62');
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
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
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
  renderTransferPanel();
  renderScheduleLineOptions();
  fetchScheduleLines();
  fetchSchedule();
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
    state.fleetAliases = buildFleetAliasIndex(state.fleet);
  } catch {
    state.fleet = {};
    state.fleetAliases = new Map();
  }
}

async function refreshAll() {
  const requestId = ++state.refreshRequestId;
  setRefreshBusy(true);

  await Promise.allSettled([
    fetchVehicles(),
    fetchDepartures(state.selectedStop),
    state.transfer.stop ? fetchTransferDepartures(state.transfer.stop, { silent: true }) : Promise.resolve(),
    fetchWeather(),
  ]);

  if (requestId === state.refreshRequestId) {
    window.setTimeout(() => {
      if (requestId === state.refreshRequestId) {
        setRefreshBusy(false);
      }
    }, 180);
  }
}

function setRefreshBusy(active) {
  els.refreshButton?.classList.toggle('is-loading', active);
  document.body.classList.toggle('is-live-refreshing', active);
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
    await ensureDelaySchedules(uniqueSortedLines(state.vehicles.map((vehicle) => vehicle.line)));
    renderVehicles();
    renderDelayPanel();
    els.lastUpdated.textContent = timeNow();
    setStatus('Reaalajas', true);
  } catch (error) {
    setStatus('Live-andmed maas', false);
    renderInlineError(els.delayList, error.message);
  }
}

async function ensureDelaySchedules(lines) {
  const wantedLines = uniqueSortedLines(lines.map(normalizeLine).filter(Boolean));
  const missingLines = wantedLines.filter((line) => !state.delayScheduleRoutes.has(line));
  if (missingLines.length === 0) {
    return;
  }

  await Promise.all(missingLines.map(async (line) => {
    try {
      const params = new URLSearchParams({ action: 'schedule', line });
      const data = await fetchJson(`api.html?${params.toString()}`);
      const routes = (data.routes || [])
        .filter((route) => normalizeLine(String(route.line || '')) === line)
        .filter((route) => Array.isArray(route.stops) && route.stops.length >= 2 && route.times);
      state.delayScheduleRoutes.set(line, routes);
    } catch {
      state.delayScheduleRoutes.set(line, []);
    }
  }));
}

function renderVehicles() {
  const activeKeys = new Set();

  state.vehicles.forEach((vehicle) => {
    const opacity = lineMapOpacity(vehicle.line);
    if (opacity <= 0) {
      return;
    }

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
      marker.setOpacity(opacity);
      marker.setPopupContent(popupContent);
      if (marker.isPopupOpen?.()) {
        window.requestAnimationFrame(hydrateIcons);
      }
      marker.options.title = title;
      marker.getElement()?.setAttribute('title', title);
      return;
    }

    marker = L.marker([vehicle.lat, vehicle.lon], {
      icon: vehicleIcon(vehicle, risk),
      pane: 'vehiclePane',
      title,
      zIndexOffset: 1000,
      opacity,
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

  els.vehicleCount.textContent = `${activeKeys.size} kaardil`;
  renderVehicleList();
  renderTransferVehicleOptions('current');
  renderTransferVehicleOptions('target');
  updateTransferResult();

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

function renderTransferPanel() {
  if (els.transferTargetLine) {
    els.transferTargetLine.value = state.transfer.targetLine || '';
  }

  renderTransferVehicleOptions('current');
  renderTransferVehicleOptions('target');
  placeTransferStopMarker(state.transfer.stop);
  renderTransferDepartures();
  updateTransferResult();

  if (state.transfer.stop) {
    fetchTransferDepartures(state.transfer.stop, { silent: true });
  }
}

function renderTransferVehicleOptions(kind = 'current') {
  const select = kind === 'target' ? els.transferTargetVehicle : els.transferCurrentVehicle;
  if (!select) {
    return;
  }

  const vehicles = transferVehicleOptions();
  const selectedKey = kind === 'target' ? state.transfer.targetVehicleKey : state.transfer.currentVehicleKey;
  const selectedExists = vehicles.some((vehicle) => vehicleKey(vehicle) === selectedKey);
  const placeholder = kind === 'target' ? 'Vali sihtbuss' : 'Vali praegune buss';
  const staleOption = selectedKey && !selectedExists
    ? `<option value="${escapeHtml(selectedKey)}">Valitud buss pole kaardil</option>`
    : '';

  select.innerHTML = [
    `<option value="">${placeholder}</option>`,
    staleOption,
    ...vehicles.map((vehicle) => {
      const key = vehicleKey(vehicle);
      return `<option value="${escapeHtml(key)}">${escapeHtml(transferVehicleLabel(vehicle))}</option>`;
    }),
  ].filter(Boolean).join('');
  select.value = selectedKey || '';
}

function transferVehicleOptions() {
  return [...state.vehicles]
    .filter(isVehicleCoordinate)
    .sort((a, b) => {
      return String(a.line).localeCompare(String(b.line), 'et', { numeric: true })
        || String(a.destination || '').localeCompare(String(b.destination || ''), 'et')
        || String(a.id || '').localeCompare(String(b.id || ''), 'et', { numeric: true });
    });
}

function transferVehicleLabel(vehicle) {
  const destination = vehicle.destination ? ` · ${vehicle.destination}` : '';
  return `${vehicle.line}${destination} · sõiduk ${vehicle.id}`;
}

function setTransferCurrentVehicle(key) {
  state.transfer.currentVehicleKey = String(key || '');
  renderTransferVehicleOptions('current');
  const vehicle = selectedTransferVehicle();
  if (vehicle) {
    ensureDelaySchedules([vehicle.line]).then(() => {
      updateTransferResult();
      refreshVehiclePopupContents();
    });
  }
  updateTransferResult();
  refreshVehiclePopupContents();
}

function setTransferTargetVehicle(key) {
  state.transfer.targetVehicleKey = String(key || '');
  const vehicle = selectedTransferTargetVehicle();
  if (vehicle) {
    state.transfer.targetLine = normalizeLine(vehicle.line || '');
    saveTransferTargetLine();
    if (els.transferTargetLine) {
      els.transferTargetLine.value = state.transfer.targetLine;
    }
    ensureDelaySchedules([vehicle.line]).then(() => {
      updateTransferResult();
      refreshVehiclePopupContents();
    });
  }

  chooseTransferDefaultDeparture();
  renderTransferVehicleOptions('target');
  renderTransferDepartures();
  updateTransferResult();
  refreshVehiclePopupContents();
}

function setTransferTargetLine(value) {
  const line = normalizeLine(String(value || ''));
  state.transfer.targetLine = line;
  state.transfer.targetVehicleKey = '';
  saveTransferTargetLine();
  if (els.transferTargetLine && els.transferTargetLine.value !== line) {
    els.transferTargetLine.value = line;
  }
  renderTransferVehicleOptions('target');
  chooseTransferDefaultDeparture();
  renderTransferDepartures();
  updateTransferResult();
  refreshVehiclePopupContents();
}

function resetTransferSelection() {
  state.transfer.currentVehicleKey = '';
  state.transfer.targetVehicleKey = '';
  state.transfer.targetLine = '';
  state.transfer.targetDepartureKey = '';
  state.transfer.stop = null;
  state.transfer.departures = [];
  state.transfer.loadingDepartures = false;
  state.transfer.departureError = '';
  state.transfer.departureRequestId += 1;

  try {
    localStorage.removeItem(TRANSFER_STOP_KEY);
    localStorage.removeItem(TRANSFER_TARGET_LINE_KEY);
  } catch {
    // Ignore storage failures; the live UI state is still reset.
  }

  if (els.transferTargetLine) {
    els.transferTargetLine.value = '';
  }
  if (els.transferStopSearch) {
    els.transferStopSearch.value = '';
  }
  if (els.transferStopResults) {
    els.transferStopResults.innerHTML = '';
  }

  state.transferStopLayer?.clearLayers();
  renderTransferVehicleOptions('current');
  renderTransferVehicleOptions('target');
  renderTransferDepartures();
  updateTransferResult();
  refreshVehiclePopupContents();
}

async function searchTransferStops() {
  const query = els.transferStopSearch?.value.trim() || '';
  if (query.length < 2) {
    if (els.transferStopResults) {
      els.transferStopResults.innerHTML = '';
    }
    return;
  }

  els.transferStopResults.innerHTML = '<div class="empty-state">Otsin...</div>';
  const params = new URLSearchParams({ action: 'stops', q: query });

  try {
    const data = await fetchJson(`api.html?${params.toString()}`);
    renderTransferStopResults(data.stops || []);
  } catch (error) {
    renderInlineError(els.transferStopResults, error.message);
  }
}

function renderTransferStopResults(stops) {
  if (!els.transferStopResults) {
    return;
  }

  if (stops.length === 0) {
    els.transferStopResults.innerHTML = '<div class="empty-state">Peatust ei leitud</div>';
    return;
  }

  els.transferStopResults.innerHTML = stops.slice(0, 8).map((stop, index) => `
    <button class="stop-result" type="button" data-transfer-stop-index="${index}">
      <strong>${escapeHtml(stop.name)}</strong>
      <span>${escapeHtml(stop.street || `ID ${stop.id}`)}</span>
    </button>
  `).join('');

  els.transferStopResults.querySelectorAll('[data-transfer-stop-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const stop = stops[Number(button.dataset.transferStopIndex || 0)];
      if (stop) {
        setTransferStop(stop);
      }
    });
  });
}

function updateInstallButtonVisibility() {
  if (!els.installButton) {
    return;
  }

  els.installButton.hidden = isInstalledApp() || (!state.deferredInstallPrompt && !isInstallHelpUseful());
}

function isInstalledApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isInstallHelpUseful() {
  return isAppleMobile() || isMobileDevice();
}

function isAppleMobile() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isMobileDevice() {
  return Boolean(navigator.userAgentData?.mobile) || /Android|webOS|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

function showInstallHelp() {
  const apple = isAppleMobile();
  const steps = apple
    ? [
      { icon: 'share', title: 'Ava jagamise menüü', body: 'Vajuta Safari alumisel ribal jagamise ikooni.' },
      { icon: 'plus', title: 'Lisa avakuvale', body: 'Vali “Lisa avakuvale” ja kinnita “Lisa”.' },
    ]
    : [
      { icon: 'ellipsis-vertical', title: 'Ava brauseri menüü', body: 'Vali “Installi rakendus” või “Lisa avakuvale”.' },
      { icon: 'check-circle-2', title: 'Kinnita paigaldus', body: 'Pärast kinnitamist avaneb BussRadar eraldi rakendusena.' },
    ];

  let panel = document.querySelector('#installHelp');
  if (!panel) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="install-help" id="installHelp" hidden>
        <div class="install-help-card" role="dialog" aria-modal="true" aria-labelledby="installHelpTitle">
          <div class="install-help-head">
            <span>
              <strong id="installHelpTitle">Paigalda BussRadar</strong>
              <small>${apple ? 'iPhone ja iPad' : 'Telefon või tahvel'}</small>
            </span>
            <button class="icon-button small" type="button" data-install-help-close aria-label="Sulge paigaldusjuhis">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div class="install-help-steps">
            ${steps.map((step) => `
              <article class="install-help-step">
                <i data-lucide="${escapeHtml(step.icon)}"></i>
                <span>
                  <strong>${escapeHtml(step.title)}</strong>
                  <small>${escapeHtml(step.body)}</small>
                </span>
              </article>
            `).join('')}
          </div>
        </div>
      </div>
    `);
    panel = document.querySelector('#installHelp');
  }

  panel.hidden = false;
  document.body.classList.add('install-help-open');
  hydrateIcons();
}

function hideInstallHelp() {
  document.querySelector('#installHelp')?.setAttribute('hidden', '');
  document.body.classList.remove('install-help-open');
}

function handleInstallHelpClick(event) {
  const panel = document.querySelector('#installHelp');
  if (!panel || panel.hidden) {
    return;
  }

  if (event.target === panel || event.target.closest('[data-install-help-close]')) {
    hideInstallHelp();
  }
}

function queueFirstVisitOnboarding() {
  if (hasSeenOnboarding()) {
    return;
  }

  window.setTimeout(() => startOnboarding(), 900);
}

function hasSeenOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'done';
  } catch (error) {
    return false;
  }
}

function markOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'done');
  } catch (error) {
    // Private browsing can block localStorage; the tour still works without saving.
  }
}

function onboardingSteps() {
  return [
    {
      selector: '#map',
      icon: 'map',
      title: 'Kaart',
      body: 'Siin näed busse, teekondi ja peatuseid. Vajuta bussile või peatusele, et avada täpsem info.',
    },
    {
      selector: '#lineForm',
      icon: 'list-plus',
      title: 'Lisa liin',
      body: 'Sisesta liininumber ja lisa see kaardile. Valitud liinide värve ja nähtavust saad hiljem samas paneelis muuta.',
    },
    {
      selector: '#scheduleToggle',
      icon: 'calendar-days',
      title: 'Sõiduplaan',
      body: 'Ava siit valitud liini sõiduplaan, suunad, peatused ja lähimad väljumised.',
    },
    {
      selector: '#stopSearchForm',
      icon: 'search',
      title: 'Peatuse otsing',
      body: 'Otsi peatust nime järgi, et näha lähiväljumisi. Peatuse aknast saad määrata ka ümberistumise peatuse.',
    },
    {
      selector: '#locateButton',
      icon: 'crosshair',
      title: 'Minu asukoht',
      body: 'Näitab sinu asukohta kaardil, kui brauser lubab asukoha kasutamist.',
    },
    {
      selector: '#themeToggle',
      icon: 'moon',
      title: 'Hele ja tume režiim',
      body: 'Vaheta kaardi ja paneelide välimust heleda ning tumeda režiimi vahel.',
    },
    {
      selector: '#refreshButton',
      icon: 'refresh-cw',
      title: 'Värskenda',
      body: 'Uuendab busside asukohad, hilinemised ja väljumised käsitsi kohe ära.',
    },
    {
      selector: '#helpButton',
      icon: 'circle-help',
      title: 'Õpetus',
      body: 'Selle nupuga saad sama juhendi hiljem uuesti avada.',
    },
  ];
}

function startOnboarding({ force = false } = {}) {
  if (state.onboarding.active) {
    return;
  }
  if (!force && hasSeenOnboarding()) {
    return;
  }

  hideInstallHelp();
  setSchedulePanelOpen(false);
  state.onboarding.steps = onboardingSteps().filter((step) => document.querySelector(step.selector));
  if (!state.onboarding.steps.length) {
    return;
  }

  state.onboarding.active = true;
  state.onboarding.index = 0;
  ensureOnboardingPanel();
  document.body.classList.add('onboarding-open');
  updateOnboarding();
}

function ensureOnboardingPanel() {
  if (document.querySelector('#onboarding')) {
    return;
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="onboarding" id="onboarding" hidden>
      <div class="onboarding-scrim" data-onboarding-close></div>
      <div class="onboarding-highlight" aria-hidden="true"></div>
      <section class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle" aria-describedby="onboardingBody">
        <div class="onboarding-card-head">
          <span class="onboarding-step-icon" id="onboardingStepIcon"></span>
          <span>
            <strong id="onboardingTitle"></strong>
            <small id="onboardingProgress"></small>
          </span>
          <button class="icon-button small" type="button" data-onboarding-close aria-label="Sulge õpetus">
            <i data-lucide="x"></i>
          </button>
        </div>
        <p id="onboardingBody"></p>
        <div class="onboarding-actions">
          <button class="tool-button secondary" type="button" data-onboarding-skip>Jäta vahele</button>
          <span>
            <button class="icon-button small" type="button" data-onboarding-prev aria-label="Eelmine samm">
              <i data-lucide="arrow-left"></i>
            </button>
            <button class="tool-button" type="button" data-onboarding-next>
              <span>Edasi</span>
              <i data-lucide="arrow-right"></i>
            </button>
          </span>
        </div>
      </section>
    </div>
  `);
  hydrateIcons();
}

function updateOnboarding() {
  const panel = document.querySelector('#onboarding');
  if (!panel || !state.onboarding.active) {
    return;
  }

  const step = state.onboarding.steps[state.onboarding.index];
  const target = step ? document.querySelector(step.selector) : null;
  if (!step || !target) {
    completeOnboarding();
    return;
  }

  if (step.selector === '#lineForm' || step.selector === '#stopSearchForm') {
    setMobilePanelCollapsed(false);
  }

  const progress = `${state.onboarding.index + 1}/${state.onboarding.steps.length}`;
  panel.hidden = false;
  panel.querySelector('#onboardingStepIcon').innerHTML = `<i data-lucide="${escapeHtml(step.icon)}"></i>`;
  panel.querySelector('#onboardingTitle').textContent = step.title;
  panel.querySelector('#onboardingProgress').textContent = progress;
  panel.querySelector('#onboardingBody').textContent = step.body;
  const prevButton = panel.querySelector('[data-onboarding-prev]');
  const nextButton = panel.querySelector('[data-onboarding-next]');
  if (prevButton) {
    prevButton.disabled = state.onboarding.index === 0;
  }
  if (nextButton) {
    nextButton.querySelector('span').textContent = state.onboarding.index === state.onboarding.steps.length - 1 ? 'Valmis' : 'Edasi';
  }

  hydrateIcons();
  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  window.requestAnimationFrame(positionOnboarding);
}

function positionOnboarding() {
  const panel = document.querySelector('#onboarding');
  if (!panel || panel.hidden || !state.onboarding.active) {
    return;
  }

  const step = state.onboarding.steps[state.onboarding.index];
  const target = step ? document.querySelector(step.selector) : null;
  const card = panel.querySelector('.onboarding-card');
  const highlight = panel.querySelector('.onboarding-highlight');
  if (!target || !card || !highlight) {
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = viewportWidth < 640 ? 8 : 10;
  const rect = target.getBoundingClientRect();
  const highlightLeft = clampNumber(rect.left - padding, 8, viewportWidth - 24);
  const highlightTop = clampNumber(rect.top - padding, 8, viewportHeight - 24);
  const highlightRight = clampNumber(rect.right + padding, 24, viewportWidth - 8);
  const highlightBottom = clampNumber(rect.bottom + padding, 24, viewportHeight - 8);

  highlight.style.left = `${highlightLeft}px`;
  highlight.style.top = `${highlightTop}px`;
  highlight.style.width = `${Math.max(16, highlightRight - highlightLeft)}px`;
  highlight.style.height = `${Math.max(16, highlightBottom - highlightTop)}px`;

  card.style.left = '12px';
  card.style.top = '12px';
  const cardRect = card.getBoundingClientRect();
  const gap = 14;
  const margin = viewportWidth < 640 ? 10 : 16;
  const targetIsLarge = rect.width > viewportWidth * 0.65 || rect.height > viewportHeight * 0.45;
  let left = targetIsLarge ? rect.left + 18 : rect.left + (rect.width / 2) - (cardRect.width / 2);
  let top;

  if (targetIsLarge) {
    top = Math.max(margin, rect.top + 18);
  } else if (rect.bottom + gap + cardRect.height <= viewportHeight - margin) {
    top = rect.bottom + gap;
  } else if (rect.top - gap - cardRect.height >= margin) {
    top = rect.top - gap - cardRect.height;
  } else {
    top = viewportHeight - cardRect.height - margin;
  }

  left = clampNumber(left, margin, viewportWidth - cardRect.width - margin);
  top = clampNumber(top, margin, viewportHeight - cardRect.height - margin);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function nextOnboardingStep() {
  if (!state.onboarding.active) {
    return;
  }

  if (state.onboarding.index >= state.onboarding.steps.length - 1) {
    completeOnboarding();
    return;
  }

  state.onboarding.index += 1;
  updateOnboarding();
}

function previousOnboardingStep() {
  if (!state.onboarding.active || state.onboarding.index === 0) {
    return;
  }

  state.onboarding.index -= 1;
  updateOnboarding();
}

function completeOnboarding({ remember = true } = {}) {
  const panel = document.querySelector('#onboarding');
  if (panel) {
    panel.hidden = true;
  }

  state.onboarding.active = false;
  state.onboarding.index = 0;
  state.onboarding.steps = [];
  document.body.classList.remove('onboarding-open');
  if (remember) {
    markOnboardingSeen();
  }
}

function handleOnboardingClick(event) {
  const panel = document.querySelector('#onboarding');
  if (!panel || panel.hidden) {
    return;
  }

  if (event.target.closest('[data-onboarding-next]')) {
    nextOnboardingStep();
    return;
  }
  if (event.target.closest('[data-onboarding-prev]')) {
    previousOnboardingStep();
    return;
  }
  if (event.target.closest('[data-onboarding-skip]') || event.target.closest('[data-onboarding-close]')) {
    completeOnboarding();
  }
}

async function setTransferStop(stop, { focus = true, openResult = false } = {}) {
  if (!isStopCoordinate(stop)) {
    return;
  }

  const nextStop = normalizeStopForStorage(stop);
  state.transfer.stop = nextStop;
  state.transfer.targetDepartureKey = '';
  saveTransferStop(nextStop);
  if (els.transferStopSearch) {
    els.transferStopSearch.value = '';
  }
  if (els.transferStopResults) {
    els.transferStopResults.innerHTML = '';
  }

  placeTransferStopMarker(nextStop);
  selectStop(nextStop);
  if (focus && state.map) {
    state.map.setView([nextStop.lat, nextStop.lon], Math.max(state.map.getZoom(), 15), { animate: true });
  }

  const departurePromise = fetchTransferDepartures(nextStop);
  updateTransferResult();
  refreshVehiclePopupContents();

  if (openResult) {
    await departurePromise;
    openTransferResultPopup();
  }
}

function openTransferResultPopup() {
  const vehicle = selectedTransferVehicle();
  if (!vehicle) {
    return;
  }

  const marker = state.vehicleMarkers.get(vehicleKey(vehicle));
  if (!marker) {
    return;
  }

  marker.setPopupContent(vehiclePopup(vehicle, vehicleDelayRisk(vehicle)));
  marker.openPopup();
  hydrateIcons();
}

function placeTransferStopMarker(stop) {
  state.transferStopLayer?.clearLayers();
  if (!isStopCoordinate(stop)) {
    return;
  }

  const marker = L.marker([stop.lat, stop.lon], {
    pane: 'transferStopPane',
    icon: transferStopIcon(stop),
    title: `${stop.name || 'Peatus'} · ümberistumine`,
    zIndexOffset: 900,
  }).addTo(state.transferStopLayer);

  marker.bindPopup(stopPopupContent(stop, [], true), {
    minWidth: 240,
    maxWidth: 310,
  });

  marker.on('click', async () => {
    await loadStopPopupDepartures(stop, marker);
  });

  hydrateIcons();
}

function transferStopIcon(stop) {
  return L.divIcon({
    className: 'transfer-stop-marker',
    html: `
      <div class="transfer-stop-pin">
        <i data-lucide="git-branch"></i>
        <strong>${escapeHtml(shortText(stop.name || 'Peatus', 16))}</strong>
      </div>
    `,
    iconSize: [154, 46],
    iconAnchor: [20, 40],
    popupAnchor: [0, -35],
  });
}

async function fetchTransferDepartures(stop, { silent = false } = {}) {
  if (!stop?.id) {
    state.transfer.departures = [];
    state.transfer.targetDepartureKey = '';
    state.transfer.loadingDepartures = false;
    state.transfer.departureError = '';
    renderTransferDepartures();
    updateTransferResult();
    return;
  }

  const requestId = ++state.transfer.departureRequestId;
  state.transfer.loadingDepartures = true;
  state.transfer.departureError = '';
  if (!silent) {
    renderTransferDepartures();
    updateTransferResult();
  }

  const params = new URLSearchParams({ action: 'departures', stopid: stop.id });

  try {
    const data = await fetchJson(`api.html?${params.toString()}`);
    if (requestId !== state.transfer.departureRequestId) {
      return;
    }

    state.transfer.departures = (data.departures || [])
      .filter((departure) => departure.type === 'bus')
      .map((departure, index) => ({
        ...departure,
        transferKey: transferDepartureKey(departure, index),
      }));
    state.transfer.loadingDepartures = false;
    chooseTransferDefaultDeparture();
    renderTransferDepartures();
    updateTransferResult();
    refreshVehiclePopupContents();
  } catch (error) {
    if (requestId !== state.transfer.departureRequestId) {
      return;
    }

    state.transfer.departures = [];
    state.transfer.loadingDepartures = false;
    state.transfer.departureError = error.message;
    renderTransferDepartures();
    updateTransferResult();
    refreshVehiclePopupContents();
  }
}

async function refreshTransferEstimate() {
  const lines = [
    selectedTransferVehicle()?.line,
    selectedTransferTargetVehicle()?.line,
    state.transfer.targetLine,
  ].map((line) => normalizeLine(String(line || ''))).filter(Boolean);

  if (lines.length > 0) {
    await ensureDelaySchedules(uniqueSortedLines(lines));
  }

  if (state.transfer.stop) {
    await fetchTransferDepartures(state.transfer.stop, { silent: true });
  }

  chooseTransferDefaultDeparture();
  renderTransferDepartures();
  updateTransferResult();
  refreshVehiclePopupContents();
}

function renderTransferDepartures() {
  if (!els.transferTargetDeparture) {
    return;
  }

  if (!state.transfer.stop) {
    els.transferTargetDeparture.innerHTML = '<option value="">Vali peatus</option>';
    els.transferTargetDeparture.value = '';
    state.transfer.targetDepartureKey = '';
    return;
  }

  if (state.transfer.loadingDepartures) {
    els.transferTargetDeparture.innerHTML = '<option value="">Laen väljumisi...</option>';
    els.transferTargetDeparture.value = '';
    state.transfer.targetDepartureKey = '';
    return;
  }

  if (state.transfer.departureError) {
    els.transferTargetDeparture.innerHTML = '<option value="">Väljumisi ei saanud laadida</option>';
    els.transferTargetDeparture.value = '';
    state.transfer.targetDepartureKey = '';
    return;
  }

  const departures = transferFilteredDepartures();
  const targetLine = normalizeLine(state.transfer.targetLine || '');

  if (departures.length === 0) {
    els.transferTargetDeparture.innerHTML = `<option value="">${escapeHtml(targetLine ? `Liin ${targetLine} lähiajal puudub` : 'Väljumisi ei leitud')}</option>`;
    els.transferTargetDeparture.value = '';
    state.transfer.targetDepartureKey = '';
    return;
  }

  const selectedKey = departures.some((departure) => departure.transferKey === state.transfer.targetDepartureKey)
    ? state.transfer.targetDepartureKey
    : departures[0].transferKey;

  els.transferTargetDeparture.innerHTML = departures.map((departure) => {
    return `<option value="${escapeHtml(departure.transferKey)}">${escapeHtml(transferDepartureLabel(departure))}</option>`;
  }).join('');
  els.transferTargetDeparture.value = selectedKey;
  state.transfer.targetDepartureKey = selectedKey;
}

function transferDepartureKey(departure, index) {
  return [
    normalizeLine(String(departure.line || '')),
    departure.expectedSeconds ?? '',
    departure.scheduledSeconds ?? '',
    departure.vehicleId || '',
    departure.destination || '',
    index,
  ].join('|');
}

function transferFilteredDepartures() {
  const targetLine = normalizeLine(state.transfer.targetLine || '');
  const targetVehicle = selectedTransferTargetVehicle();
  const targetVehicleId = String(targetVehicle?.id || '');
  return [...state.transfer.departures]
    .filter((departure) => !targetLine || normalizeLine(String(departure.line || '')) === targetLine)
    .sort((a, b) => {
      const vehicleScoreA = targetVehicleId && String(a.vehicleId || '') === targetVehicleId ? 0 : 1;
      const vehicleScoreB = targetVehicleId && String(b.vehicleId || '') === targetVehicleId ? 0 : 1;
      const waitA = transferDepartureWaitMinutes(a);
      const waitB = transferDepartureWaitMinutes(b);
      return vehicleScoreA - vehicleScoreB
        || (Number.isFinite(waitA) ? waitA : Infinity) - (Number.isFinite(waitB) ? waitB : Infinity);
    });
}

function transferDepartureLabel(departure) {
  const wait = transferDepartureWaitMinutes(departure);
  const waitLabel = Number.isFinite(wait) ? `${Math.max(0, Math.round(wait))} min` : departure.expectedTime;
  const vehicle = departure.vehicleId ? ` · ${departure.vehicleId}` : '';
  const targetVehicle = selectedTransferTargetVehicle();
  const sameVehicle = targetVehicle && String(departure.vehicleId || '') === String(targetVehicle.id || '')
    ? ' · sama buss'
    : '';
  return `${departure.line} · ${departure.destination || 'Siht teadmata'} · ${waitLabel}${vehicle}${sameVehicle}`;
}

function chooseTransferDefaultDeparture() {
  const departures = transferFilteredDepartures();
  const targetVehicle = selectedTransferTargetVehicle();
  if (targetVehicle) {
    const matchingVehicleDeparture = departures.find((departure) => {
      return String(departure.vehicleId || '') === String(targetVehicle.id || '');
    });
    if (matchingVehicleDeparture) {
      state.transfer.targetDepartureKey = matchingVehicleDeparture.transferKey;
      return;
    }
  }

  if (departures.some((departure) => departure.transferKey === state.transfer.targetDepartureKey)) {
    return;
  }

  state.transfer.targetDepartureKey = departures[0]?.transferKey || '';
}

function selectedTransferVehicle() {
  return state.vehicles.find((vehicle) => vehicleKey(vehicle) === state.transfer.currentVehicleKey) || null;
}

function selectedTransferTargetVehicle() {
  return state.vehicles.find((vehicle) => vehicleKey(vehicle) === state.transfer.targetVehicleKey) || null;
}

function selectedTransferDeparture() {
  return transferFilteredDepartures().find((departure) => departure.transferKey === state.transfer.targetDepartureKey) || null;
}

function updateTransferResult() {
  const result = calculateTransferChance();
  updateTransferSummary(result);

  if (!els.transferResult) {
    return;
  }

  if (result.status === 'ready') {
    els.transferResult.innerHTML = renderTransferChance(result);
    return;
  }

  const errorClass = result.status === 'error' || result.status === 'unavailable' ? 'error' : '';
  els.transferResult.innerHTML = `<div class="empty-state ${errorClass}">${escapeHtml(result.message)}</div>`;
}

function refreshVehiclePopupContents() {
  if (!state.vehicleMarkers?.size) {
    return;
  }

  state.vehicleMarkers.forEach((marker, key) => {
    const vehicle = state.vehicles.find((item) => vehicleKey(item) === key);
    if (!vehicle) {
      return;
    }

    marker.setPopupContent(vehiclePopup(vehicle, vehicleDelayRisk(vehicle)));
    if (marker.isPopupOpen?.()) {
      window.requestAnimationFrame(hydrateIcons);
    }
  });
}

function updateTransferSummary(result) {
  if (!els.transferSummary) {
    return;
  }

  if (result.status === 'ready') {
    els.transferSummary.textContent = `${result.probability}% võimalus`;
    return;
  }

  if (result.status === 'loading') {
    els.transferSummary.textContent = 'Laen väljumisi';
    return;
  }

  const selectedCount = [
    state.transfer.currentVehicleKey,
    state.transfer.stop?.id,
    state.transfer.targetDepartureKey || state.transfer.targetVehicleKey || state.transfer.targetLine,
  ].filter(Boolean).length;
  els.transferSummary.textContent = `${selectedCount}/3 valitud`;
}

function calculateTransferChance() {
  const vehicle = selectedTransferVehicle();
  if (!vehicle) {
    return { status: 'missing', message: 'Vali buss, mille peal oled' };
  }

  if (!state.transfer.stop) {
    return { status: 'missing', message: 'Vali ümberistumise peatus' };
  }

  if (state.transfer.loadingDepartures) {
    return { status: 'loading', message: 'Laen selle peatuse väljumisi...' };
  }

  if (state.transfer.departureError) {
    return { status: 'error', message: state.transfer.departureError };
  }

  const departure = selectedTransferDeparture();
  const targetVehicle = selectedTransferTargetVehicle();
  if (!departure && !targetVehicle) {
    return { status: 'missing', message: 'Vali buss, mille peale tahad jõuda' };
  }

  const arrival = estimateVehicleArrivalAtTransferStop(vehicle, state.transfer.stop);
  if (!arrival) {
    return { status: 'unavailable', message: 'Praeguse bussi ETA-d ei saanud piisavalt täpselt leida' };
  }

  const targetArrival = departure
    ? null
    : estimateVehicleArrivalAtTransferStop(targetVehicle, state.transfer.stop);
  if (!departure && !targetArrival) {
    return { status: 'unavailable', message: 'Sihtbussi ETA-d ei saanud selle peatuse jaoks leida' };
  }

  const targetWait = departure ? transferDepartureWaitMinutes(departure) : targetArrival.waitMinutes;
  if (!Number.isFinite(targetWait)) {
    return { status: 'unavailable', message: 'Sihtbussi väljumisaega ei saanud lugeda' };
  }

  const margin = targetWait - arrival.waitMinutes - TRANSFER_WALK_BUFFER_MINUTES;
  const gpsAge = Number(vehicle.ageSeconds || 0);
  const uncertainty = clampNumber(2.1 + (1 - arrival.confidence) * 5 + gpsAge / 90, 2.1, 7.5);
  let probability = Math.round(100 / (1 + Math.exp(-margin / uncertainty)));
  if (arrival.method === 'distance') {
    probability = Math.min(probability, 72);
  }
  probability = clampNumber(probability, 3, 97);

  const level = probability >= 70 ? 'good' : probability >= 40 ? 'medium' : 'bad';
  return {
    status: 'ready',
    level,
    probability,
    margin,
    vehicle,
    departure,
    targetVehicle,
    targetArrival,
    targetLine: departure?.line || targetVehicle?.line || state.transfer.targetLine || '',
    arrival,
    targetWait,
    targetClock: departure?.expectedTime || targetArrival?.arrivalClock || minutesToClock(Math.round(currentMinutesOfDay() + targetWait)),
  };
}

function renderTransferChance(result) {
  const title = transferOutcomeTitle(result);
  const marginLabel = transferMarginLabel(result.margin);
  const methodLabel = transferMethodLabel(result);
  const stopName = state.transfer.stop?.name || 'peatus';

  return `
    <article class="transfer-card ${result.level}">
      <div class="transfer-score">
        <strong>${result.probability}%</strong>
        <span>Tõenäosus</span>
      </div>
      <div class="transfer-card-main">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(result.vehicle.line)} jõuab ${escapeHtml(stopName)} umbes ${escapeHtml(result.arrival.arrivalClock)}; ${escapeHtml(result.targetLine || 'sihtbuss')} väljub ${escapeHtml(result.targetClock)}.</span>
        <i class="transfer-probability-bar" style="--chance: ${clampNumber(result.probability, 0, 100)}%"></i>
      </div>
    </article>
    <div class="transfer-metrics">
      <span>${escapeHtml(marginLabel)}</span>
      <span>Saabub ${escapeHtml(result.arrival.arrivalClock)}</span>
      <span>Siht ${escapeHtml(result.targetClock)}</span>
      <span>Puhver ${TRANSFER_WALK_BUFFER_MINUTES} min</span>
      <span>${escapeHtml(methodLabel)}</span>
    </div>
  `;
}

function transferOutcomeTitle(result) {
  const probability = Number(result?.probability || 0);
  if (probability >= 70) {
    return 'Jõudmine on tõenäoline';
  }

  if (probability >= 40) {
    return 'Napikas ümberistumine';
  }

  return 'Risk on suur';
}

function transferMethodLabel(result) {
  return result?.arrival?.method === 'schedule' ? 'GPS + sõiduplaan' : 'GPS kaugus';
}

function transferMarginLabel(margin) {
  const rounded = Math.round(margin);
  if (rounded >= 0) {
    return `Varu +${rounded} min`;
  }

  return `Puudu ${Math.abs(rounded)} min`;
}

function estimateVehicleArrivalAtTransferStop(vehicle, stop) {
  return estimateVehicleScheduleArrival(vehicle, stop) || estimateVehicleDistanceArrival(vehicle, stop);
}

function estimateVehicleScheduleArrival(vehicle, stop) {
  const line = normalizeLine(vehicle.line || '');
  const routes = state.delayScheduleRoutes.get(line) || [];
  const gpsAge = Number(vehicle.ageSeconds || 0);
  const destination = normalizeScheduleText(vehicle.destination || '');

  const candidates = routes.map((route) => {
    const transferIndex = routeStopIndex(route, stop);
    const position = vehicleRouteSchedulePosition(route, vehicle);
    if (transferIndex < 0 || !position) {
      return null;
    }

    if (transferIndex < position.controlStopIndex || (transferIndex === position.stopIndex && position.ratio > 0.35)) {
      return null;
    }

    const delay = scheduleDelayAtPosition(route, position);
    if (!delay) {
      return null;
    }

    const exploded = route._scheduleExploded || (route._scheduleExploded = explodeRouteTimes(route.times || ''));
    const tripCount = exploded.workdays.length;
    const scheduledTransferTime = exploded.times[transferIndex * tripCount + delay.tripIndex];
    if (!Number.isFinite(scheduledTransferTime)) {
      return null;
    }

    const destinationScore = scheduleDestinationMatchScore(route, destination);
    const pathMeters = routeDistanceFromPositionToStop(route, position, transferIndex);
    const waitMinutes = minutesUntilScheduleTime(scheduledTransferTime + delay.delayMinutes);
    const confidence = clampNumber(0.9 - position.distanceMeters / 1400 - gpsAge / 600 - (destinationScore === 0 ? 0.08 : 0), 0.45, 0.95);

    return {
      method: 'schedule',
      route,
      waitMinutes,
      arrivalClock: minutesToClock(Math.round(currentMinutesOfDay() + waitMinutes)),
      confidence,
      matchScore: position.distanceMeters + pathMeters / 120 - destinationScore * 700,
    };
  }).filter(Boolean)
    .sort((a, b) => a.matchScore - b.matchScore || a.waitMinutes - b.waitMinutes);

  return candidates[0] || null;
}

function estimateVehicleDistanceArrival(vehicle, stop) {
  if (!isVehicleCoordinate(vehicle) || !isStopCoordinate(stop)) {
    return null;
  }

  const meters = distanceMeters(vehicle.lat, vehicle.lon, stop.lat, stop.lon);
  if (!Number.isFinite(meters) || meters > 22000) {
    return null;
  }

  const speed = Number(vehicle.speed);
  const speedKmh = Number.isFinite(speed) && speed > 5 ? clampNumber(speed, 10, 45) : 20;
  const waitMinutes = (meters / (speedKmh * 1000 / 60)) * 1.25 + 1;
  return {
    method: 'distance',
    waitMinutes,
    arrivalClock: minutesToClock(Math.round(currentMinutesOfDay() + waitMinutes)),
    confidence: clampNumber(0.42 - meters / 60000, 0.22, 0.42),
  };
}

function routeStopIndex(route, targetStop) {
  const stops = Array.isArray(route.stops) ? route.stops : [];
  const exactIndex = stops.findIndex((stop) => scheduleStopsMatch(stop, targetStop));
  if (exactIndex >= 0) {
    return exactIndex;
  }

  const targetName = normalizeScheduleText(targetStop.name || '');
  let bestIndex = -1;
  let bestDistance = Infinity;
  stops.forEach((stop, index) => {
    if (!isStopCoordinate(stop)) {
      return;
    }

    const distance = distanceMeters(stop.lat, stop.lon, targetStop.lat, targetStop.lon);
    const namesMatch = targetName && normalizeScheduleText(stop.name || '') === targetName;
    if (distance < bestDistance && (distance <= 90 || (namesMatch && distance <= 220))) {
      bestIndex = index;
      bestDistance = distance;
    }
  });

  return bestIndex;
}

function routeDistanceFromPositionToStop(route, position, transferIndex) {
  const stops = Array.isArray(route.stops) ? route.stops : [];
  if (!stops[position.stopIndex] || !stops[transferIndex] || transferIndex <= position.stopIndex) {
    return 0;
  }

  let meters = 0;
  const start = stops[position.stopIndex];
  const next = stops[position.stopIndex + 1];
  if (isStopCoordinate(start) && isStopCoordinate(next)) {
    meters += distanceMeters(start.lat, start.lon, next.lat, next.lon) * (1 - clampNumber(position.ratio, 0, 1));
  }

  for (let index = position.stopIndex + 1; index < transferIndex; index += 1) {
    const from = stops[index];
    const to = stops[index + 1];
    if (isStopCoordinate(from) && isStopCoordinate(to)) {
      meters += distanceMeters(from.lat, from.lon, to.lat, to.lon);
    }
  }

  return meters;
}

function minutesUntilScheduleTime(timeMinutes) {
  const now = currentMinutesOfDay();
  const options = [timeMinutes, timeMinutes - 1440, timeMinutes + 1440]
    .map((time) => time - now)
    .filter((diff) => diff >= -1)
    .sort((a, b) => a - b);
  return Math.max(0, options[0] ?? positiveModulo(timeMinutes - now, 1440));
}

function transferDepartureWaitMinutes(departure) {
  const minutesUntil = Number(departure?.minutesUntil);
  if (Number.isFinite(minutesUntil)) {
    return Math.max(0, minutesUntil);
  }

  const expectedSeconds = Number(departure?.expectedSeconds);
  if (!Number.isFinite(expectedSeconds)) {
    return NaN;
  }

  const nowSeconds = currentMinutesOfDay() * 60;
  return positiveModulo(expectedSeconds - nowSeconds, 86400) / 60;
}

function vehicleTransferStepsHtml() {
  const steps = [
    { label: 'Minu', active: Boolean(state.transfer.currentVehicleKey) },
    { label: 'Siht', active: Boolean(state.transfer.targetDepartureKey || state.transfer.targetVehicleKey || state.transfer.targetLine) },
    { label: 'Peatus', active: Boolean(state.transfer.stop) },
  ];

  return `
    <div class="vehicle-transfer-steps" aria-label="Ümberistumise sammud">
      ${steps.map((step, index) => `
        <span class="vehicle-transfer-step ${step.active ? 'is-done' : ''}">
          <i>${step.active ? '✓' : index + 1}</i>
          <span>${escapeHtml(step.label)}</span>
        </span>
      `).join('')}
    </div>
  `;
}

function handleTransferActionClick(event) {
  const currentButton = event.target.closest('[data-transfer-current-vehicle]');
  if (currentButton) {
    event.preventDefault();
    event.stopPropagation();
    setTransferCurrentVehicle(currentButton.dataset.transferCurrentVehicle);
    return;
  }

  const targetButton = event.target.closest('[data-transfer-target-vehicle]');
  if (targetButton) {
    event.preventDefault();
    event.stopPropagation();
    setTransferTargetVehicle(targetButton.dataset.transferTargetVehicle);
    return;
  }

  const toggleButton = event.target.closest('[data-transfer-toggle]');
  if (toggleButton) {
    event.preventDefault();
    event.stopPropagation();
    state.transfer.popupExpanded = !state.transfer.popupExpanded;
    refreshVehiclePopupContents();
    return;
  }

  const resetButton = event.target.closest('[data-transfer-reset]');
  if (resetButton) {
    event.preventDefault();
    event.stopPropagation();
    resetTransferSelection();
    return;
  }

  const refreshButton = event.target.closest('[data-transfer-refresh]');
  if (refreshButton) {
    event.preventDefault();
    event.stopPropagation();
    refreshTransferEstimate();
    return;
  }

  const lineButton = event.target.closest('[data-transfer-target-line]');
  if (lineButton) {
    event.preventDefault();
    event.stopPropagation();
    setTransferTargetLine(lineButton.dataset.transferTargetLine);
    return;
  }

  const stopButton = event.target.closest('[data-transfer-stop]');
  if (stopButton) {
    event.preventDefault();
    event.stopPropagation();
    if (stopButton.disabled || stopButton.getAttribute('aria-disabled') === 'true') {
      return;
    }
    const stop = decodeFavoriteStop(stopButton.dataset.transferStop);
    if (stop) {
      setTransferStop(stop, { focus: false, openResult: true });
    }
  }
}

function hasTransferBusSelection() {
  return Boolean(state.transfer.currentVehicleKey && (state.transfer.targetVehicleKey || state.transfer.targetLine));
}

function transferSummaryText(result) {
  if (result.status === 'ready') {
    return `${transferOutcomeTitle(result)} · ${transferMarginLabel(result.margin)}`;
  }

  if (result.status === 'loading') {
    return 'Arvutan väljumisi';
  }

  if (!state.transfer.currentVehicleKey) {
    return '1. Vali Minu buss';
  }

  if (!state.transfer.targetVehicleKey && !state.transfer.targetLine) {
    return '2. Vali Sihtbuss';
  }

  if (!state.transfer.stop) {
    return '3. Vali peatus';
  }

  return result.message || 'Kontrollin ümberistumist';
}

function transferGuideState(result, vehicle) {
  if (result.status === 'loading') {
    return {
      icon: 'loader-circle',
      title: 'Arvutan tõenäosust',
      body: 'Laen valitud peatuse lähiväljumisi ja võrdlen aegu.',
      tone: 'loading',
    };
  }

  if (result.status === 'error' || result.status === 'unavailable') {
    return {
      icon: 'alert-circle',
      title: 'Arvutus jäi pooleli',
      body: result.message || 'Proovi mõnda teist peatust või uuenda andmeid.',
      tone: 'warning',
    };
  }

  if (!state.transfer.currentVehicleKey) {
    return {
      icon: 'user-round',
      title: '1. Märgi oma buss',
      body: vehicle ? 'Kui oled selle bussi peal, vajuta „Minu buss“.' : 'Ava buss, mille peal oled, ja vajuta „Minu buss“.',
      tone: 'next',
    };
  }

  if (!state.transfer.targetVehicleKey && !state.transfer.targetLine) {
    return {
      icon: 'flag',
      title: '2. Märgi sihtbuss',
      body: 'Ava buss, mille peale tahad jõuda, ja vajuta „Sihtbuss“.',
      tone: 'next',
    };
  }

  if (!state.transfer.stop) {
    return {
      icon: 'map-pin',
      title: '3. Vali ümberistumise peatus',
      body: 'Ava peatuse aken kaardil ja vajuta „Ümberistun siin“.',
      tone: 'next',
    };
  }

  return {
    icon: 'route',
    title: 'Kontrollin ümberistumist',
    body: result.message || 'Võrdlen busside saabumise ja väljumise aegu.',
    tone: 'next',
  };
}

function transferGuideHtml(result, vehicle) {
  const guide = transferGuideState(result, vehicle);
  return `
    <div class="vehicle-transfer-note ${guide.tone}">
      <i data-lucide="${escapeHtml(guide.icon)}"></i>
      <span>
        <b>${escapeHtml(guide.title)}</b>
        <small>${escapeHtml(guide.body)}</small>
      </span>
    </div>
  `;
}

function vehicleTransferPanelHtml(vehicle) {
  const key = vehicleKey(vehicle);
  const isCurrent = state.transfer.currentVehicleKey === key;
  const isTarget = state.transfer.targetVehicleKey === key;
  const stop = state.transfer.stop;
  const result = calculateTransferChance();
  const expanded = Boolean(state.transfer.popupExpanded);
  const canCalculate = Boolean(state.transfer.currentVehicleKey && (state.transfer.targetVehicleKey || state.transfer.targetLine) && stop);
  const refreshTitle = hasTransferBusSelection()
    ? stop
      ? 'Arvuta ümberistumine'
      : 'Vali ümberistumise peatus peatuse aknast'
    : 'Vali enne bussid välja';
  const hasTransferSelection = Boolean(
    state.transfer.currentVehicleKey
    || state.transfer.targetVehicleKey
    || state.transfer.targetLine
    || state.transfer.targetDepartureKey
    || stop
  );
  const selectedCount = [
    state.transfer.currentVehicleKey,
    stop?.id,
    state.transfer.targetDepartureKey || state.transfer.targetVehicleKey || state.transfer.targetLine,
  ].filter(Boolean).length;
  const statusBadge = result.status === 'ready' ? `${result.probability}%` : `${selectedCount}/3`;
  const statusText = transferSummaryText(result);
  const resultHtml = result.status === 'ready'
    ? `
      <div class="vehicle-transfer-result ${result.level}">
        <strong>${result.probability}%</strong>
        <span>
          <b>${escapeHtml(transferOutcomeTitle(result))}</b>
          <small>${escapeHtml(transferMarginLabel(result.margin))} · ${escapeHtml(result.targetClock)}</small>
        </span>
        <i class="vehicle-transfer-mini-bar" style="--chance: ${clampNumber(result.probability, 0, 100)}%"></i>
      </div>
    `
    : transferGuideHtml(result, vehicle);

  return `
    <section class="vehicle-transfer-panel ${expanded ? 'is-open' : 'is-collapsed'}" aria-label="Ümberistumise valikud">
      <button class="vehicle-transfer-toggle" type="button" data-transfer-toggle aria-expanded="${expanded ? 'true' : 'false'}">
        <span>
          <strong>Ümberistumine</strong>
          <small>${escapeHtml(statusText)}</small>
        </span>
        <em class="${result.status === 'ready' ? result.level : ''}">${escapeHtml(statusBadge)}</em>
        <i data-lucide="${expanded ? 'chevron-up' : 'chevron-down'}"></i>
      </button>
      <div class="vehicle-transfer-body" ${expanded ? '' : 'hidden'}>
        ${vehicleTransferStepsHtml()}
        <div class="vehicle-transfer-actions">
          <button class="vehicle-transfer-button ${isCurrent ? 'is-active' : ''}" type="button" data-transfer-current-vehicle="${escapeHtml(key)}" aria-pressed="${isCurrent ? 'true' : 'false'}">
            <i data-lucide="${isCurrent ? 'check' : 'user-round'}"></i>
            <span>Minu buss</span>
          </button>
          <button class="vehicle-transfer-button secondary ${isTarget ? 'is-active' : ''}" type="button" data-transfer-target-vehicle="${escapeHtml(key)}" aria-pressed="${isTarget ? 'true' : 'false'}">
            <i data-lucide="${isTarget ? 'check' : 'flag'}"></i>
            <span>Sihtbuss</span>
          </button>
        </div>
        <div class="vehicle-transfer-stop">
          <span class="vehicle-transfer-stop-name">${stop ? escapeHtml(stop.name || 'Ümberistumise peatus') : 'Peatus valimata'}</span>
          <div class="vehicle-transfer-tools">
            <button class="vehicle-transfer-refresh" type="button" data-transfer-refresh ${canCalculate ? '' : 'disabled'} title="${escapeHtml(refreshTitle)}" aria-label="${escapeHtml(refreshTitle)}">
              <i data-lucide="route"></i>
            </button>
            <button class="vehicle-transfer-reset" type="button" data-transfer-reset ${hasTransferSelection ? '' : 'disabled'} title="Nulli ümberistumine" aria-label="Nulli ümberistumine">
              <i data-lucide="rotate-ccw"></i>
            </button>
          </div>
        </div>
        ${resultHtml}
      </div>
    </section>
  `;
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
    const dark = state.theme === 'dark';

    L.polyline(segments, {
      pane: 'routePane',
      color: routeGapColor(),
      weight: style.weight + (dark ? 5 : 3),
      opacity: dark ? (style.dashArray ? 0.72 : 0.58) : (style.dashArray ? 0.58 : 0.44),
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
      weight: style.weight + (dark ? 1 : 0),
      opacity: Math.min(1, (dark ? 1 : 0.9) * emphasis),
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
  const dark = state.theme === 'dark';
  if (!pattern.isAlternating) {
    L.polyline(points, {
      pane: 'routePane',
      color: routeGapColor(),
      weight: style.weight + (dark ? 6 : 4),
      opacity: dark ? (style.dashArray ? 0.78 : 0.64) : (style.dashArray ? 0.7 : 0.58),
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
    weight: style.weight + (dark ? 1 : 0),
    opacity: Math.min(1, run.opacity * (dark ? 1.08 : 1)),
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
  return state.theme === 'dark' ? '#f3f7fb' : '#ffffff';
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
    const riskLabel = risk.level === 'low' ? '' : risk.label;
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
      ${vehicleTransferPanelHtml(vehicle)}
      <div class="popup-risk-note ${riskClass}">
        <strong>${escapeHtml(risk.label)}</strong>
        ${riskDetail}
      </div>
      ${fleetInfo}
      <dl>
        <dt>Sõiduk</dt><dd>${escapeHtml(vehicle.id)}</dd>
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
  const canSelectTransferStop = hasTransferBusSelection();
  const transferButtonText = canSelectTransferStop ? 'Ümberistun siin' : 'Vali enne bussid';
  const transferButtonTitle = canSelectTransferStop
    ? 'Kasuta seda peatust ümberistumiseks'
    : 'Vali enne praegune buss ja sihtbuss';

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
      <div class="popup-action-row">
        <button class="popup-action-button secondary" type="button" data-transfer-stop="${escapeHtml(encodeFavoriteStop(stop))}" title="${escapeHtml(transferButtonTitle)}" ${canSelectTransferStop ? '' : 'disabled aria-disabled="true"'}>${escapeHtml(transferButtonText)}</button>
      </div>
    </div>
  `;
}

function selectStop(stop) {
  clearScheduleStopHighlight();
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

function showScheduleStopHighlight(stop) {
  clearScheduleStopHighlight();
  if (!isStopCoordinate(stop)) {
    return;
  }

  const selectedStop = scheduleStopForSelection(stop);
  const marker = L.marker([stop.lat, stop.lon], {
    pane: 'scheduleStopPane',
    icon: scheduleStopHighlightIcon(stop),
    title: `${stop.name || 'Peatus'} - sõiduplaanist valitud`,
    zIndexOffset: 850,
  }).addTo(state.scheduleStopHighlightLayer);

  marker.bindPopup(stopPopupContent(selectedStop, [], true), {
    minWidth: 240,
    maxWidth: 310,
  });

  marker.on('click', async () => {
    await loadStopPopupDepartures(selectedStop, marker);
  });
}

function clearScheduleStopHighlight() {
  state.scheduleStopHighlightLayer?.clearLayers();
}

function scheduleStopHighlightIcon(stop) {
  return L.divIcon({
    className: 'schedule-stop-highlight-marker',
    html: `
      <div class="schedule-stop-highlight-pin">
        <span aria-hidden="true"></span>
        <strong>${escapeHtml(shortText(stop.name || 'Peatus', 18))}</strong>
      </div>
    `,
    iconSize: [150, 52],
    iconAnchor: [18, 42],
    popupAnchor: [0, -36],
  });
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

async function fetchScheduleLines() {
  try {
    const data = await fetchJson('api.html?action=lines&type=bus');
    state.scheduleAvailableLines = Array.isArray(data.lines)
      ? data.lines.map(normalizeLine).filter(Boolean)
      : [];

    if (!state.scheduleLine && state.scheduleAvailableLines.length > 0) {
      state.scheduleLine = state.scheduleAvailableLines[0];
      saveScheduleLine();
    }

    renderScheduleLineOptions();
  } catch (error) {
    if (els.scheduleSummary) {
      els.scheduleSummary.textContent = 'Liinid puuduvad';
    }
  }
}

function renderScheduleLineOptions() {
  if (!els.scheduleLineSelect) {
    return;
  }

  const currentLine = normalizeLine(state.scheduleLine || state.selectedLines[0] || DEFAULT_LINES[0] || '');
  const lines = uniqueSortedLines([
    ...state.selectedLines,
    ...state.scheduleAvailableLines,
    currentLine,
  ]);

  if (lines.length === 0) {
    els.scheduleLineSelect.innerHTML = '<option value="">Liin puudub</option>';
    els.scheduleLineSelect.value = '';
    return;
  }

  els.scheduleLineSelect.innerHTML = lines.map((line) => {
    const selected = line === currentLine ? ' selected' : '';
    return `<option value="${escapeHtml(line)}"${selected}>${escapeHtml(line)}</option>`;
  }).join('');
  els.scheduleLineSelect.value = currentLine;
}

function selectScheduleLine(value) {
  const line = normalizeLine(String(value || ''));
  if (!line) {
    return;
  }

  state.scheduleLine = line;
  state.scheduleRouteIndex = 0;
  state.scheduleStopIndex = 0;
  state.scheduleSelectedTripKey = '';
  clearScheduleStopHighlight();
  saveScheduleLine();
  renderScheduleLineOptions();
  fetchSchedule();
}

async function fetchSchedule() {
  const line = normalizeLine(state.scheduleLine || state.selectedLines[0] || DEFAULT_LINES[0] || '');
  if (!line) {
    renderScheduleEmpty('Vali liin');
    return;
  }

  state.scheduleLine = line;
  renderScheduleLineOptions();
  const requestId = ++state.scheduleRequestId;

  if (els.scheduleSummary) {
    els.scheduleSummary.textContent = `Liin ${line}`;
  }
  if (els.scheduleDirections) {
    els.scheduleDirections.innerHTML = '';
  }
  if (els.scheduleDirectionSelect) {
    els.scheduleDirectionSelect.innerHTML = '<option value="">Laen suunda...</option>';
    els.scheduleDirectionSelect.disabled = true;
  }
  if (els.scheduleList) {
    els.scheduleList.innerHTML = '<div class="empty-state">Laen sõiduplaani...</div>';
  }

  const params = new URLSearchParams({ action: 'schedule', line });

  try {
    const data = await fetchJson(`api.html?${params.toString()}`);
    if (requestId !== state.scheduleRequestId) {
      return;
    }

    const sourceRoutes = (data.routes || [])
      .filter((route) => normalizeLine(String(route.line || '')) === line)
      .filter((route) => Array.isArray(route.stops) && route.stops.length >= 2)
      .sort((a, b) => String(a.tag || '').localeCompare(String(b.tag || ''), 'et'));
    state.scheduleRoutes = combineScheduleRoutesByDirection(sourceRoutes);

    state.scheduleRouteIndex = clampNumber(state.scheduleRouteIndex, 0, Math.max(0, state.scheduleRoutes.length - 1));
    state.scheduleStopIndex = 0;
    state.scheduleSelectedTripKey = '';

    if (state.scheduleRoutes.length === 0) {
      renderScheduleEmpty('Sõiduplaani ei leitud');
      return;
    }

    renderScheduleDirections();
    renderScheduleRoute();
  } catch (error) {
    renderScheduleError(error.message);
  }
}

function combineScheduleRoutesByDirection(routes) {
  const groups = new Map();

  routes.forEach((route, index) => {
    const key = scheduleDirectionGroupKey(route, index);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(route);
  });

  return [...groups.values()].map((group, groupIndex) => {
    const sorted = [...group].sort((a, b) => {
      const stopDiff = (b.stops?.length || 0) - (a.stops?.length || 0);
      if (stopDiff) return stopDiff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'et', { numeric: true });
    });
    const primary = sorted[0];
    return {
      ...primary,
      tag: primary.tag || `schedule-${groupIndex}`,
      scheduleSources: sorted,
      scheduleVariantCount: sorted.length,
      stops: primary.stops || [],
      points: (primary.stops || []).map((stop) => [stop.lat, stop.lon]),
    };
  }).sort((a, b) => scheduleDirectionSortValue(a) - scheduleDirectionSortValue(b)
    || String(a.name || '').localeCompare(String(b.name || ''), 'et', { numeric: true }));
}

function scheduleDirectionGroupKey(route, index) {
  const tag = String(route.tag || '').toLowerCase();
  if (/^a.*-b/.test(tag)) return 'a-b';
  if (/^b.*-a/.test(tag)) return 'b-a';

  const stops = Array.isArray(route.stops) ? route.stops : [];
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first && last) {
    return `${normalizeScheduleText(first.name || first.stopId)}>${normalizeScheduleText(last.name || last.stopId)}`;
  }

  return `route-${index}`;
}

function scheduleDirectionSortValue(route) {
  const tag = String(route.tag || '').toLowerCase();
  if (/^a.*-b/.test(tag)) return 0;
  if (/^b.*-a/.test(tag)) return 1;
  return 2;
}

function normalizeScheduleText(value) {
  return String(value || '')
    .toLocaleLowerCase('et')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderScheduleDirections() {
  if (els.scheduleDirectionSelect) {
    if (state.scheduleRoutes.length === 0) {
      els.scheduleDirectionSelect.innerHTML = '<option value="">Suund puudub</option>';
      els.scheduleDirectionSelect.disabled = true;
      return;
    }

    els.scheduleDirectionSelect.disabled = false;
    els.scheduleDirectionSelect.innerHTML = state.scheduleRoutes.map((route, index) => {
      return `<option value="${index}">${escapeHtml(scheduleDirectionTitle(route, index))} (${escapeHtml(scheduleDirectionMeta(route, index))})</option>`;
    }).join('');
    els.scheduleDirectionSelect.value = String(state.scheduleRouteIndex);
  }

  if (!els.scheduleDirections) {
    return;
  }

  els.scheduleDirections.innerHTML = state.scheduleRoutes.map((route, index) => {
    const active = index === state.scheduleRouteIndex;
    return `
      <button class="schedule-direction${active ? ' is-active' : ''}" type="button" data-schedule-route="${index}">
        <span class="route-badge mini" data-line="${escapeHtml(route.line)}" style="--badge-color: ${routeColor(route.line)}">${escapeHtml(route.line)}</span>
        <span>
          <strong>${escapeHtml(scheduleDirectionTitle(route, index))}</strong>
          <small>${escapeHtml(scheduleDirectionMeta(route, index))}</small>
        </span>
      </button>
    `;
  }).join('');

  els.scheduleDirections.querySelectorAll('.schedule-direction').forEach((button) => {
    button.addEventListener('click', () => {
      state.scheduleRouteIndex = Number(button.dataset.scheduleRoute || 0);
      state.scheduleStopIndex = 0;
      state.scheduleSelectedTripKey = '';
      clearScheduleStopHighlight();
      renderScheduleDirections();
      state.scheduleRequestId += 1;
      renderScheduleRoute();
    });
  });
}

function renderScheduleRouteLegacy(loadTimes = true, requestId = state.scheduleRequestId) {
  const route = state.scheduleRoutes[state.scheduleRouteIndex];
  if (!route || !els.scheduleList) {
    renderScheduleEmpty('Sõiduplaani ei leitud');
    return;
  }

  const stops = Array.isArray(route.stops) ? route.stops : [];
  if (els.scheduleSummary) {
    els.scheduleSummary.textContent = `${stops.length} peatust`;
  }

  els.scheduleList.innerHTML = `
    <div class="schedule-route-head">
      <span class="route-badge" data-line="${escapeHtml(route.line)}" style="--badge-color: ${routeColor(route.line)}">${escapeHtml(route.line)}</span>
      <span>
        <strong>${escapeHtml(scheduleDirectionTitle(route, state.scheduleRouteIndex))}</strong>
        <small>${escapeHtml(scheduleDirectionMeta(route, state.scheduleRouteIndex))}</small>
      </span>
    </div>
    <div class="schedule-stops">
      ${stops.map((stop, index) => `
        <article class="schedule-stop">
          <button class="schedule-stop-focus" type="button" data-schedule-stop="${index}" title="Ava peatus kaardil">
            <span class="schedule-stop-order">${index + 1}</span>
            <span class="schedule-stop-main">
              <strong>${escapeHtml(stop.name || 'Peatus')}</strong>
              <small>${escapeHtml(stop.stopId || stop.id || '')}</small>
            </span>
          </button>
          <span class="schedule-stop-times" data-schedule-time="${index}">
            ${loadTimes ? 'Laen aegu...' : 'Ajad uuenduvad valikul'}
          </span>
        </article>
      `).join('')}
    </div>
  `;

  els.scheduleList.querySelectorAll('.schedule-stop-focus').forEach((button) => {
    button.addEventListener('click', () => {
      const stop = stops[Number(button.dataset.scheduleStop || 0)];
      if (!stop) {
        return;
      }

      selectStop(scheduleStopForSelection(stop));
      if (isStopCoordinate(stop)) {
        state.map.setView([stop.lat, stop.lon], Math.max(state.map.getZoom(), 15), { animate: true });
      }
    });
  });

  hydrateIcons();

  if (loadTimes) {
    loadScheduleDepartures(route, requestId);
  }
}

async function loadScheduleDepartures(route, requestId) {
  const stops = Array.isArray(route.stops) ? route.stops : [];
  const line = normalizeLine(String(route.line || state.scheduleLine || ''));

  await runWithConcurrency(stops, 4, async (stop, index) => {
    const target = els.scheduleList?.querySelector(`[data-schedule-time="${index}"]`);
    if (!target || requestId !== state.scheduleRequestId || !stop?.id) {
      return;
    }

    const params = new URLSearchParams({ action: 'departures', stopid: stop.id });
    try {
      const data = await fetchJson(`api.html?${params.toString()}`);
      if (requestId !== state.scheduleRequestId) {
        return;
      }

      const departures = (data.departures || [])
        .filter((departure) => departure.type === 'bus')
        .filter((departure) => normalizeLine(String(departure.line || '')) === line)
        .slice(0, 3);
      target.innerHTML = scheduleDepartureTimesHtml(departures);
      target.classList.toggle('is-empty', departures.length === 0);
    } catch {
      if (requestId === state.scheduleRequestId) {
        target.innerHTML = '<span class="schedule-time-empty">Ajad puuduvad</span>';
        target.classList.add('is-empty');
      }
    }
  });
}

function scheduleDepartureTimesHtml(departures) {
  if (departures.length === 0) {
    return '<span class="schedule-time-empty">Lähiajal pole</span>';
  }

  return departures.map((departure) => {
    const minutes = departure.minutesUntil === null || departure.minutesUntil === undefined
      ? ''
      : `${departure.minutesUntil} min`;
    const label = [minutes, departure.expectedTime].filter(Boolean).join(' · ');
    return `<span class="schedule-time-pill">${escapeHtml(label)}</span>`;
  }).join('');
}

function scheduleDirectionTitle(route, index) {
  const sources = Array.isArray(route.scheduleSources) && route.scheduleSources.length > 0
    ? route.scheduleSources
    : [route];
  const namedSource = sources
    .map((source) => String(source.name || '').trim())
    .find(Boolean);

  if (namedSource) {
    return namedSource;
  }

  const stops = Array.isArray(route.stops) ? route.stops : [];
  const firstStop = stops.find((stop) => String(stop?.name || '').trim());
  const lastStop = [...stops].reverse().find((stop) => String(stop?.name || '').trim());
  const firstName = String(firstStop?.name || '').trim();
  const lastName = String(lastStop?.name || '').trim();
  const firstNameKey = normalizeScheduleText(firstName);
  const lastDifferentStop = firstNameKey
    ? [...stops].reverse().find((stop) => {
      const name = String(stop?.name || '').trim();
      return name && normalizeScheduleText(name) !== firstNameKey;
    })
    : null;
  const lastDifferentName = String(lastDifferentStop?.name || '').trim();

  if (firstName && lastName && normalizeScheduleText(firstName) !== normalizeScheduleText(lastName)) {
    return `${firstName} - ${lastName}`;
  }

  if (firstName && lastDifferentName) {
    return `${firstName} - ${lastDifferentName}`;
  }

  if (firstName || lastName) {
    return firstName || lastName;
  }

  return `Liin ${route.line || ''} suund ${index + 1}`.trim();
}

function scheduleDirectionMeta(route) {
  const stops = Array.isArray(route.stops) ? route.stops.length : 0;
  return `${stops} peatust`;
}

function scheduleStopForSelection(stop) {
  return {
    id: String(stop.id || stop.siriId || stop.stopId || ''),
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

function renderScheduleEmpty(message) {
  if (els.scheduleSummary) {
    els.scheduleSummary.textContent = '-';
  }
  if (els.scheduleDirections) {
    els.scheduleDirections.innerHTML = '';
  }
  if (els.scheduleDirectionSelect) {
    els.scheduleDirectionSelect.innerHTML = '<option value="">Suund puudub</option>';
    els.scheduleDirectionSelect.disabled = true;
  }
  if (els.scheduleList) {
    els.scheduleList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }
}

function renderScheduleError(message) {
  if (els.scheduleSummary) {
    els.scheduleSummary.textContent = 'Viga';
  }
  if (els.scheduleDirections) {
    els.scheduleDirections.innerHTML = '';
  }
  if (els.scheduleDirectionSelect) {
    els.scheduleDirectionSelect.innerHTML = '<option value="">Suund puudub</option>';
    els.scheduleDirectionSelect.disabled = true;
  }
  if (els.scheduleList) {
    renderInlineError(els.scheduleList, message);
  }
}

async function runWithConcurrency(items, limit, worker) {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}

function renderScheduleRoute() {
  const route = state.scheduleRoutes[state.scheduleRouteIndex];
  if (!route || !els.scheduleList) {
    renderScheduleEmpty('Sõiduplaani ei leitud');
    return;
  }

  const stops = Array.isArray(route.stops) ? route.stops : [];
  state.scheduleStopIndex = clampNumber(state.scheduleStopIndex, 0, Math.max(0, stops.length - 1));
  const selectedStop = stops[state.scheduleStopIndex] || stops[0] || {};
  const schedule = buildStopSchedule(route, state.scheduleStopIndex);
  const todayDepartures = scheduleDeparturesForToday(schedule);
  const nextDepartures = scheduleNextDepartures(todayDepartures.length ? todayDepartures : schedule.all);
  const selectedDeparture = schedule.all.find((departure) => departure.key === state.scheduleSelectedTripKey);
  const selectedTripStops = selectedDeparture ? scheduleTripTimelineRows(route, selectedDeparture, selectedStop) : [];
  const stopNavEntries = selectedTripStops.length > 0
    ? selectedTripStops.map((row) => {
      const routeIndex = stops.findIndex((stop) => scheduleStopsMatch(stop, row.stop));
      return {
        stop: row.stop,
        routeIndex,
        timeLabel: minutesToClock(row.time),
        isCurrent: row.isCurrent,
      };
    })
    : stops.map((stop, index) => {
      const stopSchedule = buildStopSchedule(route, index);
      const stopTodayDepartures = scheduleDeparturesForToday(stopSchedule);
      const next = scheduleNextDepartures(stopTodayDepartures.length ? stopTodayDepartures : stopSchedule.all, 1)[0];
      return {
        stop,
        routeIndex: index,
        timeLabel: next ? minutesToClock(next.time) : '',
        isCurrent: index === state.scheduleStopIndex,
      };
    });

  if (els.scheduleSummary) {
    els.scheduleSummary.textContent = `${stops.length} peatust`;
  }

  els.scheduleList.innerHTML = `
    <div class="schedule-board">
      <div class="schedule-stop-nav${selectedDeparture ? ' has-trip-times' : ''}" aria-label="Marsruudi peatused">
        ${selectedDeparture ? `
          <div class="schedule-stop-nav-head">
            <strong>Väljumine ${escapeHtml(minutesToClock(selectedDeparture.time))}</strong>
            <small>${escapeHtml(scheduleDirectionTitle(route, state.scheduleRouteIndex))}</small>
          </div>
        ` : ''}
        ${stopNavEntries.map((entry, index) => {
          const active = entry.isCurrent || entry.routeIndex === state.scheduleStopIndex;
          return `
            <button class="schedule-stop-link${active ? ' is-active' : ''}" type="button" data-schedule-display-stop="${index}">
              <span>${escapeHtml(entry.timeLabel)}</span>
              <strong>${escapeHtml(entry.stop.name || 'Peatus')}</strong>
            </button>
          `;
        }).join('')}
      </div>

      <div class="schedule-detail">
        <div class="schedule-route-head">
          <span class="route-badge" data-line="${escapeHtml(route.line)}" style="--badge-color: ${routeColor(route.line)}">${escapeHtml(route.line)}</span>
          <span>
            <small>${escapeHtml(scheduleDirectionTitle(route, state.scheduleRouteIndex))}</small>
            <strong>${escapeHtml(selectedStop.name || 'Peatus')}</strong>
            <em>${escapeHtml(scheduleRouteStreets(route))}</em>
          </span>
        </div>

        <div class="schedule-next">
          <span><i data-lucide="clock-3"></i> Järgmised väljumised</span>
          <div>
            ${nextDepartures.length ? nextDepartures.map((departure) => `
              <strong><span class="route-badge mini" data-line="${escapeHtml(route.line)}" style="--badge-color: ${routeColor(route.line)}">${escapeHtml(route.line)}</span>${escapeHtml(departure.waitLabel)}</strong>
            `).join('') : '<small>Lähiajal väljumisi ei leitud</small>'}
          </div>
        </div>

        <div class="schedule-timetable-grid">
          ${renderScheduleTable('weekday', 'Tööpäev', schedule.groups.weekday)}
          ${renderScheduleTable('saturday', 'Laupäev', schedule.groups.saturday)}
          ${renderScheduleTable('sunday', 'Pühapäev ja riiklik püha', schedule.groups.sunday)}
        </div>

        <div class="schedule-info">
          <strong>Vedaja:</strong> ${escapeHtml(route.operator || 'Tallinna Linnatranspordi AS')}
        </div>
      </div>
    </div>
  `;

  els.scheduleList.querySelectorAll('.schedule-stop-link').forEach((button) => {
    button.addEventListener('click', () => {
      const entry = stopNavEntries[Number(button.dataset.scheduleDisplayStop || 0)];
      const stop = entry?.stop;
      if (!stop) {
        return;
      }

      if (entry.routeIndex >= 0) {
        state.scheduleStopIndex = entry.routeIndex;
      }
      selectStop(scheduleStopForSelection(stop));
      showScheduleStopHighlight(stop);
      if (isStopCoordinate(stop)) {
        state.map.setView([stop.lat, stop.lon], Math.max(state.map.getZoom(), 15), { animate: true });
      }
      renderScheduleRoute();
    });
  });

  els.scheduleList.querySelectorAll('.schedule-time-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.scheduleSelectedTripKey = button.dataset.scheduleTrip || '';
      renderScheduleRoute();
      window.setTimeout(() => {
        els.scheduleList?.querySelector('.schedule-trip-detail')?.scrollIntoView({ block: 'nearest' });
      }, 0);
    });
  });

  hydrateIcons();
}

function renderScheduleTable(key, title, departures) {
  const rows = scheduleHourRows(departures);
  return `
    <table class="schedule-table schedule-${escapeHtml(key)}">
      <thead>
        <tr>
          <th></th>
          <th>${escapeHtml(title)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map((row) => `
          <tr>
            <th>${escapeHtml(row.hourLabel)}</th>
            <td>${row.items.map((item) => `
              <button class="schedule-time-button${item.isNext ? ' is-next' : ''}${item.key === state.scheduleSelectedTripKey ? ' is-selected' : ''}" type="button" data-schedule-trip="${escapeHtml(item.key)}" title="Näita selle väljumise peatuseid">
                ${escapeHtml(item.minuteLabel)}
              </button>
            `).join('')}</td>
          </tr>
        `).join('') : '<tr><th>-</th><td><small>Väljumisi ei ole</small></td></tr>'}
      </tbody>
    </table>
  `;
}

function scheduleTripTimelineRows(route, departure, selectedStop) {
  const sources = Array.isArray(route.scheduleSources) && route.scheduleSources.length > 0
    ? route.scheduleSources
    : [route];
  const source = sources[departure.sourceIndex] || route;
  const stops = Array.isArray(source.stops) ? source.stops : [];
  const exploded = source._scheduleExploded || (source._scheduleExploded = explodeRouteTimes(source.times || ''));
  const tripCount = exploded.workdays.length;

  return stops.map((stop, index) => {
    const time = exploded.times[index * tripCount + departure.tripIndex];
    const isCurrent = scheduleStopsMatch(stop, selectedStop);
    return { stop, time, isCurrent };
  }).filter((row) => Number.isFinite(row.time) && row.time >= 0);
}

function renderScheduleTripTimeline(route, departure, selectedStop) {
  const rows = scheduleTripTimelineRows(route, departure, selectedStop).map((row) => {
    return `
      <div class="schedule-trip-stop${row.isCurrent ? ' is-current' : ''}">
        <time>${escapeHtml(minutesToClock(row.time))}</time>
        <span class="schedule-trip-dot" aria-hidden="true"></span>
        <strong>${escapeHtml(row.stop.name || 'Peatus')}</strong>
      </div>
    `;
  }).join('');

  const sources = Array.isArray(route.scheduleSources) && route.scheduleSources.length > 0
    ? route.scheduleSources
    : [route];
  const source = sources[departure.sourceIndex] || route;

  return `
    <section class="schedule-trip-detail" aria-label="Valitud väljumise peatused">
      <div class="schedule-trip-head">
        <span class="route-badge mini" data-line="${escapeHtml(route.line)}" style="--badge-color: ${routeColor(route.line)}">${escapeHtml(route.line)}</span>
        <span>
          <strong>Väljumine ${escapeHtml(minutesToClock(departure.time))}</strong>
          <small>${escapeHtml(source.name || scheduleDirectionTitle(route, state.scheduleRouteIndex))}</small>
        </span>
      </div>
      <div class="schedule-trip-timeline">
        ${rows || '<div class="empty-state">Selle väljumise peatuseid ei leitud</div>'}
      </div>
    </section>
  `;
}

function buildStopSchedule(route, stopIndex) {
  const groups = {
    weekday: [],
    saturday: [],
    sunday: [],
  };
  const all = [];
  const routeStops = Array.isArray(route.stops) ? route.stops : [];
  const selectedStop = routeStops[stopIndex];

  if (!selectedStop || stopIndex < 0 || stopIndex >= routeStops.length) {
    return { groups, all };
  }

  const sources = Array.isArray(route.scheduleSources) && route.scheduleSources.length > 0
    ? route.scheduleSources
    : [route];
  const seenDepartures = new Set();
  const serviceDay = currentScheduleDateNumber();

  sources.forEach((source, sourceIndex) => {
    const sourceStops = Array.isArray(source.stops) ? source.stops : [];
    const sourceStopIndex = sourceStops.findIndex((stop) => scheduleStopsMatch(stop, selectedStop));
    if (sourceStopIndex < 0) {
      return;
    }

    const exploded = source._scheduleExploded || (source._scheduleExploded = explodeRouteTimes(source.times || ''));
    const tripCount = exploded.workdays.length;
    if (!tripCount) {
      return;
    }

    for (let tripIndex = 0; tripIndex < tripCount; tripIndex += 1) {
      const time = exploded.times[sourceStopIndex * tripCount + tripIndex];
      if (!Number.isFinite(time) || time < 0) {
        continue;
      }

      const workdays = String(exploded.workdays[tripIndex] || '');
      const validFrom = Number(exploded.validFrom[tripIndex] || 0);
      const validTo = Number(exploded.validTo[tripIndex] || 0);
      if ((validFrom && validFrom > serviceDay) || (validTo && validTo < serviceDay)) {
        continue;
      }

      const departureKey = `${time}:${workdays}:${source.tag || sourceIndex}:${tripIndex}`;
      if (seenDepartures.has(departureKey)) {
        continue;
      }
      seenDepartures.add(departureKey);

      const item = {
        key: departureKey,
        time,
        tripIndex,
        sourceIndex,
        tag: exploded.tag[tripIndex] || '',
        workdays,
      };
      all.push(item);

      if (/[1-5]/.test(workdays)) {
        groups.weekday.push(item);
      }
      if (workdays.includes('6')) {
        groups.saturday.push(item);
      }
      if (workdays.includes('7')) {
        groups.sunday.push(item);
      }
    }
  });

  Object.values(groups).forEach((items) => items.sort((a, b) => a.time - b.time || a.tripIndex - b.tripIndex));
  all.sort((a, b) => a.time - b.time || a.tripIndex - b.tripIndex);

  const todayDepartures = scheduleDeparturesForToday({ groups, all });
  const next = new Set(scheduleNextDepartures(todayDepartures.length ? todayDepartures : all).map((item) => item.key));
  Object.values(groups).forEach((items) => {
    items.forEach((item) => {
      item.isNext = next.has(item.key);
    });
  });

  return { groups, all };
}

function scheduleStopsMatch(a, b) {
  if (!a || !b) {
    return false;
  }

  const aKeys = [a.stopId, a.id, a.siriId].map((value) => String(value || '')).filter(Boolean);
  const bKeys = [b.stopId, b.id, b.siriId].map((value) => String(value || '')).filter(Boolean);
  if (aKeys.some((key) => bKeys.includes(key))) {
    return true;
  }

  return normalizeScheduleText(a.name) === normalizeScheduleText(b.name)
    && Math.abs(Number(a.lat) - Number(b.lat)) < 0.00008
    && Math.abs(Number(a.lon) - Number(b.lon)) < 0.00008;
}

function explodeRouteTimes(raw) {
  const parts = String(raw || '').split(',');
  const times = [];
  const workdays = [];
  const validFrom = [];
  const validTo = [];
  const tagByTrip = [];
  let index = -1;
  let tripCount = 0;
  let running = 0;

  while (++index < parts.length) {
    const value = parts[index];
    if (value === '') {
      break;
    }

    const first = value.charAt(0);
    if (first === '+') {
      tagByTrip[index] = value.charAt(1) === '0' && value !== '+0' ? '2' : '1';
    } else if (first === '-' && value.charAt(1) === '0') {
      tagByTrip[index] = value.charAt(2) === '0' ? '2' : '1';
    }

    running += Number(value);
    times[tripCount] = running;
    tripCount += 1;
  }

  for (let tagIndex = tagByTrip.length - 1; tagIndex >= 0; tagIndex -= 1) {
    if (!tagByTrip[tagIndex]) {
      tagByTrip[tagIndex] = '0';
    }
  }

  const cursor = { index };
  fillRepeatedScheduleValues(parts, cursor, tripCount, validFrom);
  cursor.index -= 1;
  fillRepeatedScheduleValues(parts, cursor, tripCount, validTo);
  cursor.index -= 1;
  fillRepeatedScheduleValues(parts, cursor, tripCount, workdays, true);

  index = cursor.index - 1;
  let totalTrips = tripCount;
  let cycleStart = 5;
  let writeIndex = tripCount;
  while (++index < parts.length) {
    cycleStart += Number(parts[index]) - 5;
    let repeat = parts[++index];
    if (repeat !== '' && Number(repeat) <= totalTrips) {
      repeat = Number(repeat);
      totalTrips -= repeat;
    } else {
      repeat = totalTrips;
      totalTrips = 0;
    }

    while (repeat > 0) {
      times[writeIndex] = cycleStart + times[writeIndex - tripCount];
      writeIndex += 1;
      repeat -= 1;
    }

    if (totalTrips <= 0) {
      totalTrips = tripCount;
      cycleStart = 5;
    }
  }

  return {
    workdays,
    times,
    validFrom,
    validTo,
    tag: tagByTrip.join(''),
  };
}

function fillRepeatedScheduleValues(parts, cursor, tripCount, target, keepString = false) {
  let writeIndex = 0;
  while (++cursor.index < parts.length) {
    const value = parts[cursor.index];
    const rawCount = parts[++cursor.index];
    let count;
    if (rawCount === '') {
      count = tripCount - writeIndex;
    } else {
      count = Number(rawCount);
    }

    while (count > 0) {
      target[writeIndex] = keepString ? value : Number(value);
      writeIndex += 1;
      count -= 1;
    }

    if (rawCount === '') {
      cursor.index += 1;
      break;
    }
  }
}

function scheduleDeparturesForToday(schedule) {
  const day = new Date().getDay();
  if (day === 0) {
    return schedule.groups.sunday || [];
  }
  if (day === 6) {
    return schedule.groups.saturday || [];
  }

  return schedule.groups.weekday || [];
}

function currentScheduleDateNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function scheduleNextDepartures(departures, limit = 2) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return departures
    .map((departure) => {
      const dayTime = positiveModulo(departure.time, 1440);
      const wait = dayTime >= nowMinutes ? dayTime - nowMinutes : dayTime + 1440 - nowMinutes;
      return {
        ...departure,
        wait,
        waitLabel: wait < 60 ? `${wait} min` : minutesToClock(departure.time),
      };
    })
    .sort((a, b) => a.wait - b.wait || a.tripIndex - b.tripIndex)
    .slice(0, limit);
}

function scheduleHourRows(departures) {
  const rows = new Map();
  departures.forEach((departure) => {
    const hour = Math.floor(positiveModulo(departure.time, 1440) / 60);
    const minute = positiveModulo(departure.time, 60);
    if (!rows.has(hour)) {
      rows.set(hour, []);
    }
    rows.get(hour).push({
      key: departure.key,
      minuteLabel: String(minute).padStart(2, '0'),
      isNext: departure.isNext,
    });
  });

  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, items]) => ({
      hourLabel: String(hour),
      items,
    }));
}

function scheduleRouteStreets(route) {
  const streets = String(route.streets || '')
    .split(',')
    .map((street) => street.trim())
    .filter(Boolean);
  if (streets.length > 0) {
    return `Marsruut: ${streets.slice(0, 8).join(', ')}${streets.length > 8 ? '...' : ''}`;
  }

  return `Marsruut: ${route.stops?.map((stop) => stop.name).filter(Boolean).slice(0, 4).join(' - ') || scheduleDirectionTitle(route, 0)}`;
}

function minutesToClock(minutes) {
  const normalized = positiveModulo(minutes, 1440);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function positiveModulo(value, divisor) {
  return ((Number(value) % divisor) + divisor) % divisor;
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
    ? `${highCount} hilinemist`
    : `${lateDepartures.length + riskyVehicles.length} teadet`;

  const departureHtml = lateDepartures.slice(0, 3).map((departure) => `
    <article class="delay-item high">
      <strong>${escapeHtml(departure.line)} · +${Math.round(departure.delaySeconds / 60)} min</strong>
      <span>${escapeHtml(departure.destination)} · eeldatav aeg on plaanist hilisem</span>
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
  const estimate = vehicleScheduleDelay(vehicle);
  if (!estimate) {
    return {
      level: 'low',
      score: 1,
      label: 'Sõiduplaani järgi hilinemist ei kinnitatud',
      detail: '',
    };
  }

  const minutes = Math.round(estimate.delayMinutes);
  const detail = `${estimate.stopName} pidi olema ${minutesToClock(estimate.scheduledTime)} · GPS ${estimate.gpsAgeLabel}`;

  if (minutes >= 5) {
    return {
      level: 'high',
      score: 5,
      label: `Suur hilinemine +${minutes} min`,
      detail,
    };
  }

  if (minutes >= 2) {
    return {
      level: 'medium',
      score: 3,
      label: `Hilinemine +${minutes} min`,
      detail,
    };
  }

  return {
    level: 'low',
    score: 1,
    label: minutes <= -2 ? `Graafikust ees ${Math.abs(minutes)} min` : 'Graafikus',
    detail,
  };
}

function vehicleScheduleDelay(vehicle) {
  const line = normalizeLine(vehicle.line || '');
  const routes = state.delayScheduleRoutes.get(line) || [];
  const gpsAge = Number(vehicle.ageSeconds || 0);
  if (routes.length === 0 || gpsAge > 180) {
    return null;
  }

  const destination = normalizeScheduleText(vehicle.destination || '');
  const candidates = routes
    .map((route) => {
      const position = vehicleRouteSchedulePosition(route, vehicle);
      if (!position) {
        return null;
      }

      const destinationScore = scheduleDestinationMatchScore(route, destination);
      const delay = scheduleDelayAtPosition(route, position);
      if (!delay) {
        return null;
      }

      const bearingPenalty = Number.isFinite(Number(vehicle.bearing)) && Number.isFinite(position.heading)
        ? Math.min(160, bearingDifference(Number(vehicle.bearing), position.heading)) * 2
        : 0;

      return {
        ...delay,
        route,
        position,
        destinationScore,
        matchScore: position.distanceMeters + bearingPenalty - destinationScore * 900,
        gpsAgeLabel: `${Math.round(gpsAge)} s`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.matchScore - b.matchScore || Math.abs(a.delayMinutes) - Math.abs(b.delayMinutes));

  const best = candidates[0];
  if (!best || best.position.distanceMeters > 650 || (best.destinationScore === 0 && best.position.distanceMeters > 260)) {
    return null;
  }

  return best;
}

function scheduleDelayAtPosition(route, position) {
  const exploded = route._scheduleExploded || (route._scheduleExploded = explodeRouteTimes(route.times || ''));
  const tripCount = exploded.workdays.length;
  const nowMinutes = currentMinutesOfDay();
  const serviceDay = currentScheduleDateNumber();
  const todayCode = scheduleTodayCode();
  const stopIndex = Number.isFinite(position.controlStopIndex) ? position.controlStopIndex : position.stopIndex + 1;
  const stop = Array.isArray(route.stops) ? route.stops[stopIndex] : null;
  let best = null;

  if (!tripCount || stopIndex < 0) {
    return null;
  }

  for (let tripIndex = 0; tripIndex < tripCount; tripIndex += 1) {
    if (!isScheduleTripActive(exploded, tripIndex, serviceDay, todayCode)) {
      continue;
    }

    const scheduledTime = exploded.times[stopIndex * tripCount + tripIndex];
    if (!Number.isFinite(scheduledTime)) {
      continue;
    }

    const delayMinutes = closestScheduleDifference(nowMinutes, scheduledTime);

    if (Math.abs(delayMinutes) > 45) {
      continue;
    }

    if (!best || Math.abs(delayMinutes) < Math.abs(best.delayMinutes)) {
      best = {
        delayMinutes,
        scheduledTime,
        stopName: stop?.name || position.stopName || 'järgmine peatus',
        tripIndex,
      };
    }
  }

  return best;
}

function vehicleRouteSchedulePosition(route, vehicle) {
  const stops = Array.isArray(route.stops) ? route.stops : [];
  if (stops.length < 2) {
    return null;
  }

  let best = null;
  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index];
    const end = stops[index + 1];
    if (!isStopCoordinate(start) || !isStopCoordinate(end)) {
      continue;
    }

    const projection = projectPointToStopSegment(vehicle.lat, vehicle.lon, start, end);
    if (!best || projection.distanceMeters < best.distanceMeters) {
      const controlStopIndex = projection.ratio < 0.18 ? index : index + 1;
      const controlStop = projection.ratio < 0.18 ? start : end;
      best = {
        stopIndex: index,
        controlStopIndex,
        ratio: projection.ratio,
        distanceMeters: projection.distanceMeters,
        heading: routeStopHeading(start, end),
        stopName: controlStop.name || 'peatus',
      };
    }
  }

  return best;
}

function projectPointToStopSegment(lat, lon, start, end) {
  const midLat = (Number(start.lat) + Number(end.lat) + Number(lat)) / 3;
  const metersPerLon = Math.max(25000, 111320 * Math.cos(midLat * Math.PI / 180));
  const bx = (Number(end.lon) - Number(start.lon)) * metersPerLon;
  const by = (Number(end.lat) - Number(start.lat)) * 111320;
  const px = (Number(lon) - Number(start.lon)) * metersPerLon;
  const py = (Number(lat) - Number(start.lat)) * 111320;
  const lengthSquared = bx * bx + by * by;
  const ratio = clampNumber(lengthSquared ? (px * bx + py * by) / lengthSquared : 0, 0, 1);
  const dx = px - bx * ratio;
  const dy = py - by * ratio;

  return {
    ratio,
    distanceMeters: Math.hypot(dx, dy),
  };
}

function scheduleDestinationMatchScore(route, destination) {
  if (!destination) {
    return 0;
  }

  const stops = Array.isArray(route.stops) ? route.stops : [];
  const lastStop = normalizeScheduleText(stops[stops.length - 1]?.name || '');
  const routeName = normalizeScheduleText(route.name || '');

  if (lastStop && lastStop === destination) return 5;
  if (lastStop && (lastStop.includes(destination) || destination.includes(lastStop))) return 4;
  if (routeName.endsWith(destination)) return 3;
  if (routeName.includes(destination)) return 2;
  return 0;
}

function isScheduleTripActive(exploded, tripIndex, serviceDay, todayCode) {
  const workdays = String(exploded.workdays[tripIndex] || '');
  const validFrom = Number(exploded.validFrom[tripIndex] || 0);
  const validTo = Number(exploded.validTo[tripIndex] || 0);

  return workdays.includes(todayCode)
    && (!validFrom || validFrom <= serviceDay)
    && (!validTo || validTo >= serviceDay);
}

function currentMinutesOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function scheduleTodayCode(date = new Date()) {
  const day = date.getDay();
  return day === 0 ? '7' : String(day);
}

function closestScheduleDifference(nowMinutes, scheduledTime) {
  const options = [scheduledTime, scheduledTime - 1440, scheduledTime + 1440];
  return options
    .map((time) => nowMinutes - time)
    .sort((a, b) => Math.abs(a) - Math.abs(b))[0];
}

function routeStopHeading(start, end) {
  const lat = (Number(start.lat) + Number(end.lat)) / 2;
  const metersPerLon = Math.max(25000, 111320 * Math.cos(lat * Math.PI / 180));
  const dx = (Number(end.lon) - Number(start.lon)) * metersPerLon;
  const dy = (Number(end.lat) - Number(start.lat)) * 111320;
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

function bearingDifference(a, b) {
  const diff = Math.abs(Number(a) - Number(b)) % 360;
  return Math.min(diff, 360 - diff);
}

function vehicleProfile(vehicle) {
  const fleet = findVehicleFleetRecord(vehicle);

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

  const power = vehiclePowerKind(fleet);
  const size = vehicleSizeKind(fleet);
  const isElectric = power === 'electric';
  const isArticulated = size === 'articulated';
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
    model: fleet.model || '',
    power,
    size,
    facts,
  };
}

function findVehicleFleetRecord(vehicle) {
  const aliases = vehicleIdAliases(vehicle?.id);

  for (const alias of aliases) {
    if (state.fleet[alias]) {
      return state.fleet[alias];
    }
  }

  for (const alias of aliases) {
    const fleet = state.fleetAliases.get(alias);
    if (fleet) {
      return fleet;
    }
  }

  return null;
}

function buildFleetAliasIndex(fleet) {
  const buckets = new Map();

  Object.values(fleet || {}).forEach((item) => {
    const aliases = new Set([
      ...vehicleIdAliases(item.id),
      ...vehicleIdAliases(registrationNumberPart(item.registration)),
      ...vehicleIdAliases(String(item.id || '').slice(-3)),
    ]);

    aliases.forEach((alias) => {
      if (!alias) return;
      if (!buckets.has(alias)) {
        buckets.set(alias, new Set());
      }
      buckets.get(alias).add(String(item.id || '').trim());
    });
  });

  const index = new Map();
  buckets.forEach((ids, alias) => {
    if (ids.size !== 1) {
      return;
    }

    const [id] = [...ids];
    if (fleet[id]) {
      index.set(alias, fleet[id]);
    }
  });

  return index;
}

function vehicleIdAliases(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) {
    return [];
  }

  const aliases = new Set([digits, digits.replace(/^0+/, '') || '0']);
  if (digits.length <= 3) {
    aliases.add(digits.padStart(3, '0'));
  }

  return [...aliases].filter(Boolean);
}

function registrationNumberPart(registration) {
  const match = String(registration || '').match(/\d+/);
  return match ? match[0] : '';
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
  const size = vehicleSizeKind(fleet);
  if (size === 'articulated') {
    return 'Pikk buss';
  }

  if (size === 'standard') {
    return 'Lühike buss';
  }

  return '';
}

function vehiclePowerLabel(fleet) {
  const power = vehiclePowerKind(fleet);
  if (power === 'electric') {
    return 'Elektriga';
  }

  if (power === 'hybrid') {
    return 'Hübriid';
  }

  if (power === 'cng') {
    return 'Gaasiga';
  }

  if (power === 'diesel') {
    return 'Kütusega';
  }

  return '';
}

function vehicleSizeKind(fleet) {
  if (fleet?.size === 'articulated' || fleet?.isArticulated === true) {
    return 'articulated';
  }

  if (fleet?.size === 'standard') {
    return 'standard';
  }

  const length = Number(fleet?.lengthMeters);
  if (Number.isFinite(length)) {
    return length >= 14 ? 'articulated' : 'standard';
  }

  const model = vehicleModelNeedle(fleet);
  if (/\b(18|18m|a40|6x2|ng323|ng313)\b|liigend|articulated| lion'?s city gl /.test(model)) {
    return 'articulated';
  }

  if (/\b(12|12m|12\.|a78|a21|nl283|el293|7900|procity)\b|urbino iv 12|urbino 12|irizar i4 12/.test(model)) {
    return 'standard';
  }

  return '';
}

function vehiclePowerKind(fleet) {
  if (['electric', 'hybrid', 'cng', 'diesel'].includes(fleet?.power)) {
    return fleet.power;
  }

  const model = vehicleModelNeedle(fleet);
  if (/electric|ecitaro|\bev\b|12m ev|e-bus|elektr/.test(model) || fleet?.isElectric === true) {
    return 'electric';
  }

  if (/hybrid|hübriid|hubriid/.test(model)) {
    return 'hybrid';
  }

  if (/cng|gaas/.test(model)) {
    return 'cng';
  }

  if (model) {
    return 'diesel';
  }

  return '';
}

function vehicleModelNeedle(fleet) {
  return [
    fleet?.model,
    fleet?.powerLabel,
    fleet?.powerShort,
    fleet?.sizeLabel,
  ].filter(Boolean).join(' ').toLocaleLowerCase('et');
}

function vehicleFacts(fleet, sizeLabel, powerLabel) {
  const facts = [];

  if (sizeLabel) {
    facts.push({ icon: 'ruler', label: sizeLabel });
  }

  if (powerLabel) {
    facts.push({ icon: vehiclePowerIcon(vehiclePowerKind(fleet)), label: powerLabel });
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
          ${vehicleFactIconHtml('info')}
          <strong>Info puudub</strong>
        </span>
      </div>
    `;
  }

  return `
    <div class="vehicle-facts">
      ${profile.facts.map((fact) => `
        <span class="vehicle-fact">
          ${vehicleFactIconHtml(fact.icon)}
          <strong>${escapeHtml(fact.label)}</strong>
        </span>
      `).join('')}
    </div>
  `;
}

function vehicleFactIconHtml(icon) {
  const icons = {
    info: '<svg class="vehicle-fact-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7h.01"></path></svg>',
    ruler: '<svg class="vehicle-fact-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15 15 4l5 5L9 20z"></path><path d="M8 15l-2-2"></path><path d="M11 12l-2-2"></path><path d="M14 9l-2-2"></path></svg>',
    zap: '<svg class="vehicle-fact-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-14h-7z"></path></svg>',
    leaf: '<svg class="vehicle-fact-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20c8 0 14-6 14-14V4h-2C9 4 3 10 3 18c0 1 1 2 2 2z"></path><path d="M3 20c4-6 8-9 14-12"></path></svg>',
    fuel: '<svg class="vehicle-fact-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"></path><path d="M4 11h11"></path><path d="M15 7h2l3 3v7a2 2 0 0 1-2 2h-1"></path></svg>',
  };

  return icons[icon] || icons.info;
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
      renderScheduleLineOptions();
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

    if (element.classList.contains('route-badge')) {
      element.style.setProperty('--badge-color', color);
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

function updateUserLocation(position, { center = false } = {}) {
  if (!state.map) {
    return;
  }

  const coords = [position.coords.latitude, position.coords.longitude];
  const accuracy = Number(position.coords.accuracy);

  if (!state.userLocationAccuracyCircle) {
    state.userLocationAccuracyCircle = L.circle(coords, {
      radius: Number.isFinite(accuracy) ? accuracy : 35,
      color: '#0f5e62',
      weight: 1.5,
      fillColor: '#0f5e62',
      fillOpacity: 0.08,
      opacity: 0.32,
      interactive: false,
    }).addTo(state.map);
  } else {
    state.userLocationAccuracyCircle.setLatLng(coords);
    if (Number.isFinite(accuracy)) {
      state.userLocationAccuracyCircle.setRadius(accuracy);
    }
  }

  if (!state.userLocationMarker) {
    state.userLocationMarker = L.circleMarker(coords, {
      radius: 8,
      color: '#ffffff',
      weight: 2.5,
      fillColor: '#0f5e62',
      fillOpacity: 0.95,
      className: 'user-location-marker',
    }).addTo(state.map).bindPopup('Sinu asukoht');
  } else {
    state.userLocationMarker.setLatLng(coords);
  }

  if (center) {
    state.map.setView(coords, Math.max(state.map.getZoom(), 15));
    state.userLocationMarker.openPopup();
  }
}

function requestUserLocation({ center = false } = {}) {
  if (!navigator.geolocation) {
    setStatus('Asukoht puudub', false);
    return;
  }

  if (state.userLocationPending) {
    return;
  }

  state.userLocationPending = true;
  navigator.geolocation.getCurrentPosition((position) => {
    state.userLocationPending = false;
    updateUserLocation(position, { center });
  }, (error) => {
    state.userLocationPending = false;
    if (error.code === 1 || error.code === error.PERMISSION_DENIED) {
      stopUserLocationTracking();
      setStatus('Asukoht keelatud', false);
      return;
    }

    setStatus('GPS uuendus ebaõnnestus', false);
  }, {
    enableHighAccuracy: true,
    timeout: 4500,
    maximumAge: 0,
  });
}

function stopUserLocationTracking() {
  state.userLocationActive = false;
  state.userLocationPending = false;
  if (state.userLocationTimer) {
    window.clearInterval(state.userLocationTimer);
    state.userLocationTimer = null;
  }
}

function locateUser() {
  if (!navigator.geolocation) {
    setStatus('Asukoht puudub', false);
    return;
  }

  state.userLocationActive = true;
  requestUserLocation({ center: true });

  if (state.userLocationTimer) {
    window.clearInterval(state.userLocationTimer);
  }

  state.userLocationTimer = window.setInterval(() => {
    if (state.userLocationActive) {
      requestUserLocation();
    }
  }, GPS_REFRESH_MS);
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

function loadScheduleLine() {
  try {
    const stored = normalizeLine(localStorage.getItem('bussradar.scheduleLine') || '');
    if (stored) {
      return stored;
    }
  } catch {
    return DEFAULT_LINES[0];
  }

  return DEFAULT_LINES[0];
}

function saveScheduleLine() {
  if (state.scheduleLine) {
    localStorage.setItem('bussradar.scheduleLine', state.scheduleLine);
  }
}

function uniqueSortedLines(lines) {
  return [...new Set(lines.map((line) => normalizeLine(String(line || ''))).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'et', { numeric: true }));
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

function loadTransferStop() {
  try {
    const stored = JSON.parse(localStorage.getItem(TRANSFER_STOP_KEY) || 'null');
    if (isStopCoordinate(stored)) {
      return normalizeStopForStorage(stored);
    }
  } catch {
    return null;
  }

  return null;
}

function saveTransferStop(stop) {
  if (isStopCoordinate(stop)) {
    localStorage.setItem(TRANSFER_STOP_KEY, JSON.stringify(normalizeStopForStorage(stop)));
  }
}

function loadTransferTargetLine() {
  try {
    return normalizeLine(localStorage.getItem(TRANSFER_TARGET_LINE_KEY) || '');
  } catch {
    return '';
  }
}

function saveTransferTargetLine() {
  if (state.transfer.targetLine) {
    localStorage.setItem(TRANSFER_TARGET_LINE_KEY, state.transfer.targetLine);
  } else {
    localStorage.removeItem(TRANSFER_TARGET_LINE_KEY);
  }
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
    let reloadedForWorker = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedForWorker || sessionStorage.getItem('bussradar.swReloaded') === '166') {
        return;
      }

      reloadedForWorker = true;
      sessionStorage.setItem('bussradar.swReloaded', '166');
      window.location.reload();
    });

    navigator.serviceWorker.register('service-worker.js?v=166').then((registration) => {
      registration.update?.();

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});
  }
}
