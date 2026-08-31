(function () {
  const USERS_KEY = 'bussradar.staticUsers';
  const SESSION_KEY = 'bussradar.staticSession';
  const USERNAME_PATTERN = /^[a-z0-9._-]{2,32}$/;
  const MIN_PASSWORD_LENGTH = 6;
  const DATA_BASE = 'https://transport.tallinn.ee';
  const GEOCODE_BASE = 'https://nominatim.openstreetmap.org/search';
  const KNOWN_TALLINN_PLACES = [
    { name: 'Solaris Keskus', street: 'Estonia pst 9', area: 'Südalinn', lat: 59.4323, lon: 24.7540, type: 'Kaubanduskeskus', aliases: ['solaris'] },
    { name: 'Viru Keskus', street: 'Viru väljak 4', area: 'Südalinn', lat: 59.4365, lon: 24.7564, type: 'Kaubanduskeskus', aliases: ['viru'] },
    { name: 'Ülemiste Keskus', street: 'Suur-Sõjamäe 4', area: 'Ülemiste', lat: 59.4214, lon: 24.7939, type: 'Kaubanduskeskus', aliases: ['ulemiste', 'ülemiste'] },
    { name: 'T1 Keskus', street: 'Peterburi tee 2', area: 'Ülemiste', lat: 59.4242, lon: 24.7925, type: 'Kaubanduskeskus', aliases: ['t1', 'mall of tallinn'] },
    { name: 'Kristiine Keskus', street: 'Endla 45', area: 'Kristiine', lat: 59.4265, lon: 24.7217, type: 'Kaubanduskeskus', aliases: ['kristiine'] },
    { name: 'Rocca al Mare Keskus', street: 'Paldiski mnt 102', area: 'Haabersti', lat: 59.4262, lon: 24.6513, type: 'Kaubanduskeskus', aliases: ['rocca', 'rocca al mare'] },
    { name: 'Tallinna Bussijaam', street: 'Lastekodu 46', area: 'Kesklinn', lat: 59.4272, lon: 24.7734, type: 'Bussijaam', aliases: ['bussijaam', 'tallinn bus station'] },
    { name: 'Tallinna Lennujaam', street: 'Tartu mnt 101', area: 'Ülemiste', lat: 59.4133, lon: 24.8328, type: 'Lennujaam', aliases: ['lennujaam', 'airport', 'tll'] },
    { name: 'Balti jaam', street: 'Toompuiestee 37', area: 'Kalamaja', lat: 59.4390, lon: 24.7372, type: 'Raudteejaam', aliases: ['balti jaam', 'train station'] },
    { name: 'Tallinna Sadam D-terminal', street: 'Lootsi 13', area: 'Sadama', lat: 59.4436, lon: 24.7687, type: 'Sadam', aliases: ['d-terminal', 'd terminal', 'sadam'] },
    { name: 'Vabaduse väljak', street: 'Vabaduse väljak', area: 'Kesklinn', lat: 59.4338, lon: 24.7445, type: 'Väljak', aliases: ['vabaduse'] },
    { name: 'Raekoja plats', street: 'Raekoja plats', area: 'Vanalinn', lat: 59.4372, lon: 24.7453, type: 'Väljak', aliases: ['raekoda', 'old town'] },
    { name: 'Telliskivi Loomelinnak', street: 'Telliskivi 60a', area: 'Kalamaja', lat: 59.4389, lon: 24.7285, type: 'Koht', aliases: ['telliskivi'] },
    { name: 'Noblessner', street: 'Peetri 10', area: 'Kalamaja', lat: 59.4526, lon: 24.7388, type: 'Koht', aliases: ['noblessner'] },
    { name: 'Kumu Kunstimuuseum', street: 'Valge 1', area: 'Kadriorg', lat: 59.4360, lon: 24.7969, type: 'Muuseum', aliases: ['kumu'] },
    { name: 'Kadrioru park', street: 'A. Weizenbergi', area: 'Kadriorg', lat: 59.4384, lon: 24.7906, type: 'Park', aliases: ['kadriorg'] },
    { name: 'Mustamäe Keskus', street: 'A. H. Tammsaare tee 104a', area: 'Mustamäe', lat: 59.4073, lon: 24.6812, type: 'Kaubanduskeskus', aliases: ['mustamäe keskus', 'mustamae keskus'] },
    { name: 'Lasnamäe Centrum', street: 'Mustakivi tee 13', area: 'Lasnamäe', lat: 59.4402, lon: 24.8706, type: 'Kaubanduskeskus', aliases: ['lasnamäe centrum', 'lasnamae centrum'] },
  ];
  const DEFAULT_PROXY_BASES = [
    'https://r.jina.ai/http://{rawUrl}',
    'https://api.allorigins.win/raw?url=',
  ];
  const textCache = new Map();

  function canHandle(url) {
    try {
      return new URL(url, window.location.href).pathname.endsWith('/api.html');
    } catch {
      return false;
    }
  }

  async function request(url, options = {}) {
    const parsed = new URL(url, window.location.href);
    const action = parsed.searchParams.get('action') || '';

    switch (action) {
      case 'vehicles':
        return handleVehicles(parsed.searchParams);
      case 'stops':
        return handleStops(parsed.searchParams);
      case 'places':
        return handlePlaces(parsed.searchParams);
      case 'mapStops':
        return handleMapStops(parsed.searchParams);
      case 'lines':
        return handleLines(parsed.searchParams);
      case 'routes':
        return handleRoutes(parsed.searchParams);
      case 'plannerRoutes':
        return handlePlannerRoutes(parsed.searchParams);
      case 'schedule':
        return handleSchedule(parsed.searchParams);
      case 'departures':
        return handleDepartures(parsed.searchParams);
      case 'schools':
        return handleSchools();
      case 'authStatus':
        return handleAuthStatus();
      case 'login':
        return handleLogin(options);
      case 'register':
        return handleRegister(options);
      case 'logout':
        return handleLogout();
      case 'preferences':
        return handlePreferences(options);
      default:
        throw new Error('Tundmatu API tegevus.');
    }
  }

  async function handleVehicles(params) {
    const rawType = cleanText(params.get('type') || 'bus').toLowerCase();
    const wantedType = rawType === 'all' ? 'all' : sanitizeTransportType(rawType);
    const lineFilter = normalizeLineList(params.get('lines') || '', wantedType);
    const raw = await fetchText(`${DATA_BASE}/gps.txt`, { ttl: 5000, preferLive: true });
    const vehicles = parseGpsVehicles(raw).filter((vehicle) => {
      if (wantedType && wantedType !== 'all' && vehicle.type !== wantedType) {
        return false;
      }

      return lineFilter.length === 0 || lineFilter.includes(String(vehicle.line).toUpperCase());
    });

    return {
      ok: true,
      source: `${DATA_BASE}/gps.txt`,
      updatedAt: new Date().toISOString(),
      vehicles,
    };
  }

  async function handleStops(params) {
    const query = cleanText(params.get('q') || '');
    if (query.length < 2) {
      return { ok: true, stops: [] };
    }

    const raw = await fetchText(`${DATA_BASE}/data/stops.txt`, { ttl: 60 * 60 * 1000 });
    const sourceStops = parseTallinnStops(raw, query, false);
    const stops = sourceStops.slice(0, 18);

    return {
      ok: true,
      source: `${DATA_BASE}/data/stops.txt`,
      stops,
    };
  }

  async function handlePlaces(params) {
    const query = cleanText(params.get('q') || '');
    if (query.length < 2) {
      return { ok: true, places: [] };
    }

    const localPlaces = await localPlaceResults(query);
    if (localPlaces.length > 0) {
      return {
        ok: true,
        source: 'local',
        updatedAt: new Date().toISOString(),
        geocodeError: '',
        places: uniqueGeocodePlaces(localPlaces).slice(0, 12),
      };
    }

    let remotePlaces = [];
    let geocodeError = '';
    const geocodeQuery = /tallinn|eesti|estonia/i.test(query)
      ? query
      : `${query}, Tallinn, Eesti`;
    const search = new URLSearchParams({
      format: 'jsonv2',
      q: geocodeQuery,
      addressdetails: '1',
      namedetails: '1',
      limit: '10',
      countrycodes: 'ee',
      'accept-language': 'et',
      viewbox: '24.35,59.65,25.25,59.25',
      bounded: '0',
    });
    const source = `${GEOCODE_BASE}?${search.toString()}`;

    try {
      const cached = textCache.get(source);
      const now = Date.now();
      const raw = cached && now - cached.time < 6 * 60 * 60 * 1000
        ? cached.text
        : await fetchGeocodeText(source);
      textCache.set(source, { time: now, text: raw });
      const rows = JSON.parse(raw);
      remotePlaces = (Array.isArray(rows) ? rows : [])
        .map((row, index) => normalizeGeocodePlace(row, query, index))
        .filter(Boolean);
    } catch (error) {
      geocodeError = error?.message || 'Kohaotsing ei vastanud.';
    }

    const places = uniqueGeocodePlaces([...localPlaces, ...remotePlaces]).slice(0, 12);

    return {
      ok: true,
      source,
      updatedAt: new Date().toISOString(),
      geocodeError,
      places,
    };
  }

  async function handleMapStops(params) {
    const raw = await fetchText(`${DATA_BASE}/data/stops.txt`, { ttl: 60 * 60 * 1000 });
    const sourceStops = parseStructuredStops(raw).filter((stop) => isTallinnMapCoordinate(stop.lat, stop.lon));

    return {
      ok: true,
      source: `${DATA_BASE}/data/stops.txt`,
      updatedAt: new Date().toISOString(),
      stops: sourceStops,
    };
  }

  async function handleLines(params) {
    const wantedType = sanitizeTransportType(cleanText(params.get('type') || 'bus').toLowerCase());
    const raw = await fetchText(`${DATA_BASE}/data/routes.txt`, { ttl: 60 * 60 * 1000 });
    const lines = parseAvailableLines(raw, wantedType);

    return {
      ok: true,
      source: `${DATA_BASE}/data/routes.txt`,
      updatedAt: new Date().toISOString(),
      lines,
    };
  }

  async function handleRoutes(params) {
    const wantedType = sanitizeTransportType(cleanText(params.get('type') || 'bus').toLowerCase());
    const lineFilter = normalizeLineList(params.get('lines') || '', wantedType);
    if (lineFilter.length === 0) {
      return { ok: true, routes: [] };
    }

    const [stopsRaw, routesRaw] = await Promise.all([
      fetchText(`${DATA_BASE}/data/stops.txt`, { ttl: 60 * 60 * 1000 }),
      fetchText(`${DATA_BASE}/data/routes.txt`, { ttl: 60 * 60 * 1000 }),
    ]);
    const stopsByPlatformId = new Map();

    parseStructuredStops(stopsRaw, true).forEach((stop) => {
      stopsByPlatformId.set(stop.stopId, stop);
    });

    const stopRoutes = parseRouteLines(routesRaw, stopsByPlatformId, lineFilter, false, wantedType);
    const currentLineFilter = [...new Set(stopRoutes.map((route) => route.line))];
    const shapeRoutes = await parseOfficialLineShapeRoutes(currentLineFilter, wantedType);
    const routes = shapeRoutes.length > 0
      ? mergeShapeRoutesWithStops(shapeRoutes, stopRoutes)
      : stopRoutes.map((route) => ({ ...route, shapeQuality: 'route-stops' }));

    return {
      ok: true,
      source: `${DATA_BASE}/data/tallinna-linn_${shapeTransportName(wantedType)}_<line>.txt`,
      updatedAt: new Date().toISOString(),
      routes,
    };
  }

  async function handleSchedule(params) {
    const wantedType = sanitizeTransportType(cleanText(params.get('type') || 'bus').toLowerCase());
    const lineFilter = normalizeLineList(params.get('line') || params.get('lines') || '', wantedType);
    if (lineFilter.length === 0) {
      return { ok: true, routes: [] };
    }

    const [stopsRaw, routesRaw] = await Promise.all([
      fetchText(`${DATA_BASE}/data/stops.txt`, { ttl: 60 * 60 * 1000 }),
      fetchText(`${DATA_BASE}/data/routes.txt`, { ttl: 60 * 60 * 1000 }),
    ]);
    const stopsByPlatformId = new Map();

    parseStructuredStops(stopsRaw, true).forEach((stop) => {
      stopsByPlatformId.set(stop.stopId, stop);
    });

    const routes = parseRouteLines(routesRaw, stopsByPlatformId, lineFilter, true, wantedType);

    return {
      ok: true,
      source: `${DATA_BASE}/data/routes.txt`,
      updatedAt: new Date().toISOString(),
      routes,
    };
  }

  async function handlePlannerRoutes(params) {
    const wantedType = sanitizeTransportType(cleanText(params.get('type') || 'bus').toLowerCase());
    const [stopsRaw, routesRaw] = await Promise.all([
      fetchText(`${DATA_BASE}/data/stops.txt`, { ttl: 60 * 60 * 1000 }),
      fetchText(`${DATA_BASE}/data/routes.txt`, { ttl: 60 * 60 * 1000 }),
    ]);
    const stopsByPlatformId = new Map();

    parseStructuredStops(stopsRaw, true).forEach((stop) => {
      stopsByPlatformId.set(stop.stopId, stop);
    });

    const lineFilter = parseAvailableLines(routesRaw, wantedType);
    const routes = parseRouteLines(routesRaw, stopsByPlatformId, lineFilter, false, wantedType)
      .filter((route) => route.type === wantedType)
      .map((route) => ({
        ...route,
        points: route.stops.map((stop) => [stop.lat, stop.lon]),
        shapeQuality: 'planner-stops',
      }));

    return {
      ok: true,
      source: `${DATA_BASE}/data/routes.txt`,
      updatedAt: new Date().toISOString(),
      routes,
    };
  }

  async function handleDepartures(params) {
    const stopId = cleanText(params.get('stopid') || '');
    if (!/^[A-Za-z0-9-]+$/.test(stopId)) {
      throw new Error('Peatuse ID puudub.');
    }

    const source = `${DATA_BASE}/siri-stop-departures.php?stopid=${encodeURIComponent(stopId)}`;
    const raw = await fetchText(source, { ttl: 8000, preferLive: true });
    const parsed = parseDepartures(raw);

    return {
      ok: true,
      source,
      stopId,
      serverSeconds: parsed.serverSeconds,
      updatedAt: new Date().toISOString(),
      departures: parsed.departures,
    };
  }

  async function handleSchools() {
    const response = await fetch('data/schools.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Koolide andmestik puudub.');
    }

    const schools = await response.json();
    if (!Array.isArray(schools)) {
      throw new Error('Koolide andmestik on vigane.');
    }

    return {
      ok: true,
      updatedAt: new Date().toISOString(),
      schools,
    };
  }

  function handleAuthStatus() {
    const username = currentUsername();
    if (!username) {
      return {
        ok: true,
        authenticated: false,
        user: null,
        preferences: defaultPreferences(),
      };
    }

    return authPayload(username);
  }

  async function handleLogin(options) {
    const payload = await requestPayload(options);
    const username = normalizeUsername(payload.username || '');
    const password = String(payload.password || '');

    if (!username || !password) {
      throw new Error('Kasutajanimi ja parool on vajalikud.');
    }

    const store = readUserStore();
    const user = store.users[username];
    const passwordHash = await hashPassword(username, password);
    if (!user || user.passwordHash !== passwordHash) {
      throw new Error('Kasutajanimi või parool ei sobi.');
    }

    writeStorage(SESSION_KEY, username);
    return authPayload(username);
  }

  async function handleRegister(options) {
    const payload = await requestPayload(options);
    const username = normalizeUsername(payload.username || '');
    const password = String(payload.password || '');

    if (!username) {
      throw new Error('Kasutajanimi võib sisaldada tähti, numbreid, punkti, alakriipsu ja sidekriipsu.');
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Parool peab olema vähemalt ${MIN_PASSWORD_LENGTH} märki.`);
    }

    const store = readUserStore();
    if (store.users[username]) {
      throw new Error('Selline kasutaja on juba olemas.');
    }

    const now = new Date().toISOString();
    store.users[username] = {
      username,
      passwordHash: await hashPassword(username, password),
      preferences: defaultPreferences(),
      createdAt: now,
      updatedAt: now,
    };
    writeUserStore(store);
    writeStorage(SESSION_KEY, username);

    return authPayload(username);
  }

  function handleLogout() {
    removeStorage(SESSION_KEY);
    return {
      ok: true,
      authenticated: false,
      user: null,
      preferences: defaultPreferences(),
    };
  }

  async function handlePreferences(options) {
    const username = currentUsername();
    if (!username) {
      throw new Error('Logi esmalt sisse.');
    }

    const method = String(options.method || 'GET').toUpperCase();
    if (method !== 'POST') {
      return authPayload(username);
    }

    const store = readUserStore();
    if (!store.users[username]) {
      removeStorage(SESSION_KEY);
      throw new Error('Kasutajat ei leitud.');
    }

    store.users[username].preferences = normalizePreferences(await requestPayload(options));
    store.users[username].updatedAt = new Date().toISOString();
    writeUserStore(store);

    return authPayload(username);
  }

  async function requestPayload(options) {
    const body = options.body;
    if (!body) {
      return {};
    }

    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch {
        return {};
      }
    }

    if (body instanceof FormData) {
      return Object.fromEntries(body.entries());
    }

    return {};
  }

  function authPayload(username) {
    const store = readUserStore();
    const user = store.users[username];
    if (!user) {
      removeStorage(SESSION_KEY);
      return {
        ok: true,
        authenticated: false,
        user: null,
        preferences: defaultPreferences(),
      };
    }

    return {
      ok: true,
      authenticated: true,
      user: { username, createdAt: user.createdAt || null, updatedAt: user.updatedAt || null },
      preferences: normalizePreferences(user.preferences || {}),
    };
  }

  function currentUsername() {
    return normalizeUsername(readStorage(SESSION_KEY, ''));
  }

  function readUserStore() {
    try {
      const parsed = JSON.parse(readStorage(USERS_KEY, '{}') || '{}');
      return parsed && typeof parsed === 'object' && parsed.users && typeof parsed.users === 'object'
        ? parsed
        : { users: {} };
    } catch {
      return { users: {} };
    }
  }

  function writeUserStore(store) {
    writeStorage(USERS_KEY, JSON.stringify({
      users: store.users && typeof store.users === 'object' ? store.users : {},
    }));
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
      throw new Error('Brauser ei luba konto andmeid salvestada.');
    }
  }

  function removeStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Kui salvestusruum on keelatud, pole eemaldada samuti midagi.
    }
  }

  async function hashPassword(username, password) {
    const value = `${username}:${password}`;
    if (window.crypto?.subtle && window.TextEncoder) {
      const bytes = new TextEncoder().encode(value);
      const hash = await window.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    return btoa(unescape(encodeURIComponent(value))).split('').reverse().join('');
  }

  function defaultPreferences() {
    return {
      lines: [],
      transportType: 'bus',
      stop: null,
      favoriteStops: [],
      lineColors: {},
      lineEmphasis: {},
      theme: 'light',
    };
  }

  function normalizePreferences(payload) {
    const preferences = defaultPreferences();
    preferences.transportType = sanitizeTransportType(payload.transportType || 'bus');
    const lines = Array.isArray(payload.lines)
      ? payload.lines
      : String(payload.lines || '').split(/[\s,;]+/);

    preferences.lines = [...new Set(lines.map((line) => normalizeRouteLine(String(line), preferences.transportType)).filter(Boolean))];
    preferences.stop = normalizePreferenceStop(payload.stop);
    preferences.favoriteStops = Array.isArray(payload.favoriteStops)
      ? payload.favoriteStops.map(normalizePreferenceStop).filter(Boolean)
      : [];
    preferences.lineColors = Object.fromEntries(
      Object.entries(payload.lineColors || {})
        .map(([line, color]) => [normalizePreferenceLineStateKey(line), String(color)])
        .filter(([line, color]) => line && /^#[0-9a-f]{6}$/i.test(color))
    );
    preferences.lineEmphasis = Object.fromEntries(
      Object.entries(payload.lineEmphasis || {})
        .map(([line, value]) => [normalizePreferenceLineStateKey(line), clamp(Number(value), 0, 1)])
        .filter(([line, value]) => line && Number.isFinite(value))
    );
    preferences.theme = payload.theme === 'dark' ? 'dark' : 'light';

    return preferences;
  }

  function normalizePreferenceStop(stop) {
    if (!stop || typeof stop !== 'object') {
      return null;
    }

    const lat = Number(stop.lat);
    const lon = Number(stop.lon);
    const id = cleanText(stop.id || stop.stopId || '');
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon) || !isTallinnTransitCoordinate(lat, lon)) {
      return null;
    }

    return {
      id,
      stopId: cleanText(stop.stopId || id),
      name: cleanText(stop.name || 'Peatus'),
      street: cleanText(stop.street || ''),
      lat,
      lon,
    };
  }

  function normalizePreferenceLineStateKey(value) {
    const text = cleanText(value);
      const match = text.match(/^(bus|tram|trol|trolley|trolleybus):(.+)$/i);
      if (match) {
        const line = normalizeRouteLine(match[2], match[1].toLowerCase());
        return line ? lineStateKey(line, match[1].toLowerCase()) : '';
      }

    const line = normalizeLine(text);
    return line ? lineStateKey(line, 'bus') : '';
  }

  async function fetchText(url, { ttl = 0, preferLive = false } = {}) {
    const now = Date.now();
    const cached = textCache.get(url);
    if (cached && ttl > 0 && now - cached.time < ttl) {
      return cached.text;
    }

    const liveUrl = preferLive ? cacheBustedUrl(url) : url;
    const mirror = mirrorUrl(url);
    const proxies = proxyUrls(liveUrl);
    const attempts = preferLive
      ? [liveUrl, proxies[0], mirror, ...proxies.slice(1)].filter(Boolean)
      : [mirror, url, ...proxies].filter(Boolean);
    let lastError = null;

    for (const attempt of attempts) {
      try {
        const response = await fetchWithTimeout(attempt, { cache: 'no-store' }, 7000);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        if (looksLikeProxyFailure(text)) {
          throw new Error('Proxy tagastas vealehe.');
        }

        textCache.set(url, { time: now, text });
        return text;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`Andmeallikat ei saanud avada: ${lastError?.message || 'võrguviga'}.`);
  }

  async function fetchGeocodeText(url) {
    const response = await fetchWithTimeout(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    }, 4500);

    if (!response.ok) {
      throw new Error(`Kohaotsing ei vastanud: HTTP ${response.status}`);
    }

    return response.text();
  }

  function proxyUrls(url) {
    const custom = window.BUSSRADAR_CORS_PROXY || readStorage('bussradar.corsProxy', '') || '';
    return [custom, ...DEFAULT_PROXY_BASES]
      .filter(Boolean)
      .map((base) => buildProxyUrl(base, url));
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function looksLikeProxyFailure(text) {
    const trimmed = String(text || '').trim().slice(0, 400).toLowerCase();
    return trimmed.startsWith('<!doctype html')
      || trimmed.startsWith('<html')
      || trimmed.includes('<title>error')
      || trimmed.includes('cloudflare')
      || trimmed.includes('server-side requests are not allowed');
  }

  function cacheBustedUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      parsed.searchParams.set('_live', String(Date.now()));
      return parsed.toString();
    } catch {
      return url;
    }
  }

  function mirrorUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.origin !== DATA_BASE) {
        return '';
      }

      if (parsed.pathname === '/gps.txt') {
        return 'data/live/gps.txt';
      }

      if (parsed.pathname === '/data/stops.txt') {
        return 'data/live/stops.txt';
      }

      if (parsed.pathname === '/data/routes.txt') {
        return 'data/live/routes.txt';
      }

      const shape = parsed.pathname.match(/^\/data\/tallinna-linn_(bus|tram|trol)_([^/]+)\.txt$/);
      if (shape) {
        const type = sanitizeTransportType(shape[1]);
        const line = encodeURIComponent(shapeMirrorLineName(type, shape[2]));
        if (type === 'tram') {
          return `data/live/shapes/tram/${line}.txt`;
        }
        if (type === 'trolleybus') {
          return `data/live/shapes/trolleybus/${line}.txt`;
        }
        return `data/live/shapes/${line}.txt`;
      }
    } catch {
      return '';
    }

    return '';
  }

  function buildProxyUrl(base, url) {
    if (base.includes('{rawUrl}')) {
      return base.replace('{rawUrl}', url);
    }

    if (base.includes('{url}')) {
      return base.replace('{url}', encodeURIComponent(url));
    }

    if (base.endsWith('=') || base.endsWith('?')) {
      return `${base}${encodeURIComponent(url)}`;
    }

    return `${base.replace(/\/$/, '')}/${encodeURIComponent(url)}`;
  }

  function parseGpsVehicles(raw) {
    return raw.split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((lineText) => /^\d+,[^,]+,\d+,\d+,/.test(lineText))
      .map((lineText) => parseCsvLine(lineText, ','))
      .filter((parts) => parts.length >= 10)
      .map((parts) => {
        const typeCode = cleanText(parts[0]);
        const line = cleanText(parts[1]).toUpperCase();
        const lon = parseScaledCoordinate(parts[2], 1000000);
        const lat = parseScaledCoordinate(parts[3], 1000000);
        const speed = normalizeSpeed(parseNullableNumber(parts[4]));
        const bearing = normalizeBearing(parseNullableNumber(parts[5]));
        const id = cleanText(parts[6]);
        const status = cleanText(parts[7]);
        const ageSeconds = parseNullableNumber(parts[8]);
        const destination = cleanText(parts.slice(9).join(','));

        return {
          id,
          line,
          destination,
          type: transportTypeFromCode(typeCode),
          typeCode,
          lat,
          lon,
          speed,
          bearing,
          status,
          ageSeconds,
        };
      })
      .filter((vehicle) => vehicle.type && vehicle.id && vehicle.line && vehicle.lat !== null && vehicle.lon !== null)
      .filter((vehicle) => isTallinnTransitCoordinate(vehicle.lat, vehicle.lon));
  }

  function parseTallinnStops(raw, query, includeAggregates = false) {
    const queryNeedle = query.toLocaleLowerCase('et');
    const results = parseStructuredStops(raw, includeAggregates)
      .filter((stop) => isTallinnMapCoordinate(stop.lat, stop.lon))
      .filter((stop) => {
        const haystack = `${stop.name} ${stop.street} ${stop.id} ${stop.stopId}`.toLocaleLowerCase('et');
        return haystack.includes(queryNeedle);
      });

    results.sort((a, b) => {
      const aName = String(a.name).toLocaleLowerCase('et');
      const bName = String(b.name).toLocaleLowerCase('et');
      const aExact = aName === queryNeedle ? 0 : 1;
      const bExact = bName === queryNeedle ? 0 : 1;
      const aStarts = aName.startsWith(queryNeedle) ? 0 : 1;
      const bStarts = bName.startsWith(queryNeedle) ? 0 : 1;

      return aExact - bExact
        || aStarts - bStarts
        || String(a.name).localeCompare(String(b.name), 'et')
        || String(a.stopId).localeCompare(String(b.stopId), 'et', { numeric: true });
    });

    return results;
  }

  async function localPlaceResults(query) {
    const knownPlaces = knownTallinnPlaceResults(query);
    const schoolPlaces = await schoolPlaceResults(query);
    return [...knownPlaces, ...schoolPlaces];
  }

  function knownTallinnPlaceResults(query) {
    return KNOWN_TALLINN_PLACES
      .filter((place) => placeMatchesQuery(place, query))
      .map((place, index) => ({
        id: `known:${index}:${normalizeSearchText(place.name)}`,
        stopId: '',
        siriId: '',
        name: place.name,
        street: place.street,
        area: place.area,
        city: 'Tallinn',
        lat: place.lat,
        lon: place.lon,
        isCoordinate: true,
        isPlace: true,
        type: place.type,
      }));
  }

  async function schoolPlaceResults(query) {
    try {
      const response = await fetch('data/schools.json', { cache: 'no-store' });
      if (!response.ok) {
        return [];
      }

      const schools = await response.json();
      return (Array.isArray(schools) ? schools : [])
        .filter((school) => placeMatchesQuery(school, query))
        .map((school, index) => ({
          id: `school:${index}:${normalizeSearchText(school.name)}`,
          stopId: '',
          siriId: '',
          name: cleanText(school.name),
          street: '',
          area: '',
          city: 'Tallinn',
          lat: Number(school.lat),
          lon: Number(school.lon),
          isCoordinate: true,
          isPlace: true,
          type: 'Kool',
        }))
        .filter((place) => isTallinnTransitCoordinate(place.lat, place.lon));
    } catch {
      return [];
    }
  }

  function placeMatchesQuery(place, query) {
    const needle = normalizeSearchText(query);
    const aliases = Array.isArray(place.aliases) ? place.aliases.join(' ') : '';
    const haystack = normalizeSearchText(`${place.name || ''} ${place.street || ''} ${place.area || ''} ${place.city || ''} ${aliases}`);
    return haystack.includes(needle);
  }

  function normalizeGeocodePlace(row, query, index) {
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isTallinnTransitCoordinate(lat, lon)) {
      return null;
    }

    const address = row.address && typeof row.address === 'object' ? row.address : {};
    const namedetails = row.namedetails && typeof row.namedetails === 'object' ? row.namedetails : {};
    const road = cleanText(address.road || address.pedestrian || address.footway || address.path || '');
    const house = cleanText(address.house_number || '');
    const area = cleanText(address.suburb || address.city_district || address.neighbourhood || address.quarter || '');
    const city = cleanText(address.city || address.town || address.municipality || 'Tallinn');
    const fallbackName = cleanText(String(row.display_name || '').split(',')[0] || query);
    const name = cleanText(
      namedetails.name
      || row.name
      || address.amenity
      || address.shop
      || address.tourism
      || address.leisure
      || address.building
      || fallbackName
      || query
    );
    const street = road && house ? `${road} ${house}` : road;
    const displayParts = String(row.display_name || '')
      .split(',')
      .map(cleanText)
      .filter(Boolean)
      .filter((part) => part !== name)
      .slice(0, 3);
    const id = cleanText(row.osm_type && row.osm_id
      ? `place:${row.osm_type}:${row.osm_id}`
      : `place:${lat.toFixed(6)},${lon.toFixed(6)}:${index}`);

    return {
      id,
      stopId: '',
      siriId: '',
      name: name || query,
      street: street || displayParts.join(', '),
      area,
      city,
      lat,
      lon,
      isCoordinate: true,
      isPlace: true,
      type: geocodeTypeLabel(row),
    };
  }

  function geocodeTypeLabel(row) {
    const typeKey = cleanText(row?.type || row?.class || '').toLowerCase();
    if (!typeKey) {
      return 'Koht';
    }

    const labels = {
      bus_stop: 'Peatus',
      tram_stop: 'Peatus',
      stop_position: 'Peatus',
      house: 'Aadress',
      residential: 'Piirkond',
      suburb: 'Piirkond',
      neighbourhood: 'Piirkond',
      shopping_centre: 'Kaubanduskeskus',
      supermarket: 'Pood',
      restaurant: 'Söögikoht',
      cafe: 'Kohvik',
      school: 'Kool',
      university: 'Ülikool',
      hospital: 'Haigla',
      hotel: 'Hotell',
    };

    return labels[typeKey] || 'Koht';
  }

  function uniqueGeocodePlaces(places) {
    const seen = new Set();
    return places.filter((place) => {
      const key = `${normalizeSearchText(place.name)}:${place.lat.toFixed(5)}:${place.lon.toFixed(5)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function normalizeSearchText(value) {
    return cleanText(value)
      .toLocaleLowerCase('et')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
  }

  function parseStructuredStops(raw, includeAggregates = false) {
    const rows = tableRows(raw, ';');
    const stops = [];
    const byPlatformId = new Map();
    const seen = new Set();

    rows.slice(1).forEach((sourceRow) => {
      const row = padRow(sourceRow, 10);
      const platformId = cleanText(removeBom(row[0]));
      const siriId = cleanText(row[1]);
      const lat = parseScaledCoordinate(row[2], 100000);
      const lon = parseScaledCoordinate(row[3], 100000);
      const name = cleanText(row[5]);
      const street = cleanText(row[7]);
      const area = cleanText(row[8]);
      const city = cleanText(row[9]);

      if (!platformId || lat === null || lon === null) {
        return;
      }

      const isAggregate = platformId.startsWith('a');
      if (isAggregate && !includeAggregates) {
        return;
      }

      const id = siriId || platformId;
      const key = `${platformId}:${id}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      stops.push({
        id,
        stopId: platformId,
        siriId,
        name,
        street: street === '0' ? '' : street,
        area,
        city,
        lat,
        lon,
        relatedStopIds: cleanText(row[4]).split(',').map(cleanText).filter(Boolean),
      });
      byPlatformId.set(platformId, stops.length - 1);
    });

    stops.forEach((stop) => {
      if (stop.name) {
        return;
      }

      for (const relatedStopId of stop.relatedStopIds) {
        const related = stops[byPlatformId.get(relatedStopId)];
        if (related?.name) {
          stop.name = related.name;
          if (!stop.street) {
            stop.street = related.street;
          }
          break;
        }
      }
    });

    return stops.map((stop) => ({
      id: stop.id,
      stopId: stop.stopId,
      siriId: stop.siriId,
      name: stop.name || `Peatus ${stop.stopId}`,
      street: stop.street,
      area: stop.area,
      city: stop.city,
      lat: stop.lat,
      lon: stop.lon,
    }));
  }

  function parseAvailableLines(raw, wantedType = 'bus') {
    const rows = tableRows(raw, ';');
    const lines = new Set();
    let currentLine = '';
    let currentTransport = '';

    rows.slice(1).forEach((sourceRow) => {
      const row = padRow(sourceRow, 14);
      const rawTransport = cleanText(row[3]).toLowerCase();
      const transport = rawTransport ? sanitizeTransportType(rawTransport) : '';
      const rawLine = cleanText(removeBom(row[0]));
      const line = normalizeRouteLine(rawLine, transport || currentTransport || wantedType);

      if (rawLine && !line) {
        return;
      }

      if (line) {
        currentLine = line;
      }

      if (transport) {
        currentTransport = transport;
      }

      const routeStopsRaw = cleanText(row[13]);
      const typeMatches = !wantedType || wantedType === 'all' || currentTransport === wantedType;
      if (currentLine && routeStopsRaw && typeMatches) {
        lines.add(currentLine);
      }
    });

    return [...lines].sort((a, b) => a.localeCompare(b, 'et', { numeric: true }));
  }

  function parseRouteLines(raw, stopsByPlatformId, lineFilter, includeTimes = false, wantedType = 'bus') {
    const rows = tableRows(raw, ';');
    const routes = [];
    let currentLine = '';
    let currentTransport = '';

    rows.slice(1).forEach((sourceRow, sourceIndex) => {
      const row = padRow(sourceRow, 14);
      const rawTransport = cleanText(row[3]).toLowerCase();
      const transport = rawTransport ? sanitizeTransportType(rawTransport) : '';
      const rawLine = cleanText(removeBom(row[0]));
      const line = normalizeRouteLine(rawLine, transport || currentTransport || wantedType);

      if (rawLine && !line) {
        return;
      }

      if (line) {
        currentLine = line;
      }

      if (transport) {
        currentTransport = transport;
      }

      const routeStopsRaw = cleanText(row[13]);
      if (!currentLine || !routeStopsRaw || !lineFilter.includes(currentLine)) {
        return;
      }

      const typeMatches = !wantedType || wantedType === 'all' || currentTransport === wantedType;
      if (currentTransport && !typeMatches) {
        return;
      }

      const stops = routeStopsRaw.split(',')
        .map(cleanText)
        .filter(Boolean)
        .map((routeStopId) => stopsByPlatformId.get(routeStopId))
        .filter(Boolean)
        .map((stop) => ({
          id: stop.id,
          stopId: stop.stopId,
          siriId: stop.siriId,
          name: stop.name,
          street: stop.street,
          area: stop.area,
          city: stop.city,
          lat: stop.lat,
          lon: stop.lon,
        }));

      if (stops.length < 2) {
        return;
      }

      routes.push({
        line: currentLine,
        type: sanitizeTransportType(currentTransport || wantedType || 'bus'),
        tag: cleanText(row[8]),
        routeType: cleanText(row[9]),
        name: cleanText(row[10]),
        weekdays: cleanText(row[11]),
        streets: cleanText(row[12]),
        operator: cleanText(row[4]),
        points: stops.map((stop) => [stop.lat, stop.lon]),
        stops,
        ...(includeTimes ? { times: cleanText(rows[sourceIndex + 2]?.[0] || '') } : {}),
      });
    });

    return routes;
  }

  async function parseOfficialLineShapeRoutes(lineFilter, wantedType = 'bus') {
    const groups = await Promise.all(lineFilter.map(async (line) => {
      const url = `${DATA_BASE}/data/tallinna-linn_${shapeTransportName(wantedType)}_${encodeURIComponent(shapeLineName(wantedType, line))}.txt`;
      try {
        const raw = await fetchText(url, { ttl: 60 * 60 * 1000 });
        return parseOfficialLineShapeFile(line, raw, wantedType);
      } catch {
        return [];
      }
    }));

    return groups.flat().sort((a, b) => {
      return String(a.line).localeCompare(String(b.line), 'et', { numeric: true })
        || String(a.tag).localeCompare(String(b.tag), 'et');
    });
  }

  function parseOfficialLineShapeFile(line, raw, wantedType = 'bus') {
    const routesByTag = new Map();
    let tag = '';
    let encoded = '';

    function flush() {
      if (!tag || !encoded) {
        return;
      }

      const points = decodePolyline(encoded);
      if (points.length >= 2) {
        const route = {
          line,
          type: sanitizeTransportType(wantedType),
          tag,
          name: '',
          points,
          stops: [],
          shapeQuality: 'road-shape',
          shapeSource: 'official-line',
        };
        const key = routeKey(line, tag);
        const current = routesByTag.get(key);
        if (!current || points.length > current.points.length) {
          routesByTag.set(key, route);
        }
      }
    }

    raw.split(/\r\n|\r|\n/).map((row) => row.trim()).filter(Boolean).forEach((row) => {
      if (isOfficialShapeTag(row)) {
        flush();
        tag = officialDirectionTag(row);
        encoded = '';
        return;
      }

      if (tag && !/^B+$/.test(row)) {
        encoded += row;
      }
    });

    flush();
    return [...routesByTag.values()];
  }

  function mergeShapeRoutesWithStops(shapeRoutes, stopRoutes) {
    const stopRoutesByKey = new Map(stopRoutes.map((route) => [routeKey(route.line, route.tag), route]));
    const merged = [];
    const seen = new Set();

    shapeRoutes.forEach((route) => {
      const key = routeKey(route.line, route.tag);
      const fallback = stopRoutesByKey.get(key);
      const mergedRoute = { ...route };

      if (fallback) {
        mergedRoute.name = fallback.name || mergedRoute.name;
        mergedRoute.stops = fallback.stops;
      }

      merged.push(mergedRoute);
      seen.add(key);
    });

    stopRoutes.forEach((route) => {
      const key = routeKey(route.line, route.tag);
      if (!seen.has(key)) {
        merged.push({
          ...route,
          points: [],
          shapeQuality: 'stops-only',
        });
      }
    });

    return merged;
  }

  function parseDepartures(raw) {
    const text = raw.replace(/\r\n|\r|\n/g, ',').trim();
    const parts = parseCsvLine(text, ',').map(cleanText);
    const modes = ['bus', 'tram', 'trolley', 'trolleybus'];
    const serverSeconds = parts.find((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) < 90000);
    const departures = [];

    for (let i = 0; i + 6 < parts.length; i += 1) {
      const mode = parts[i].toLowerCase();
      if (!modes.includes(mode)) {
        continue;
      }

      const expected = Number.parseInt(parts[i + 2], 10);
      const scheduled = Number.parseInt(parts[i + 3], 10);
      if (!Number.isFinite(expected) || !Number.isFinite(scheduled)) {
        continue;
      }

      const currentSeconds = serverSeconds === undefined ? null : Number(serverSeconds);
      departures.push({
        type: sanitizeTransportType(mode),
        line: parts[i + 1].toUpperCase(),
        expectedSeconds: expected,
        scheduledSeconds: scheduled,
        expectedTime: secondsToClock(expected),
        scheduledTime: secondsToClock(scheduled),
        minutesUntil: currentSeconds === null ? null : Math.ceil(Math.max(0, expected - currentSeconds) / 60),
        delaySeconds: expected - scheduled,
        destination: parts[i + 4],
        vehicleId: parts[i + 5],
        status: parts[i + 6],
      });

      i += 6;
    }

    return {
      serverSeconds: serverSeconds === undefined ? null : Number(serverSeconds),
      departures,
    };
  }

  function decodePolyline(encoded) {
    const points = [];
    let index = 0;
    let lat = 0;
    let lon = 0;

    while (index < encoded.length) {
      const latValue = decodePolylineValue(encoded, index);
      if (!latValue) break;
      index = latValue.index;

      const lonValue = decodePolylineValue(encoded, index);
      if (!lonValue) break;
      index = lonValue.index;

      lat += latValue.value;
      lon += lonValue.value;

      const pointLat = round(lat / 100000, 6);
      const pointLon = round(lon / 100000, 6);
      if (isTallinnMapCoordinate(pointLat, pointLon)) {
        points.push([pointLat, pointLon]);
      }
    }

    return points;
  }

  function decodePolylineValue(encoded, startIndex) {
    let result = 0;
    let shift = 0;
    let index = startIndex;
    let byte = 0;

    do {
      if (index >= encoded.length) {
        return null;
      }

      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return {
      value: (result & 1) ? ~(result >> 1) : (result >> 1),
      index,
    };
  }

  function tableRows(text, delimiter) {
    return text.split(/\r\n|\r|\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => parseCsvLine(line, delimiter));
  }

  function parseCsvLine(line, delimiter = ',') {
    const values = [];
    let value = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          value += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        values.push(value);
        value = '';
        continue;
      }

      value += char;
    }

    values.push(value);
    return values;
  }

  function padRow(row, length) {
    const padded = [...row];
    while (padded.length < length) {
      padded.push('');
    }
    return padded;
  }

  function normalizeLineList(input, type = 'bus') {
    return [...new Set(String(input).toUpperCase().trim().split(/[\s,;]+/)
      .map((item) => normalizeRouteLine(item, type))
      .filter((item) => /^[0-9A-Z]+$/.test(item)))];
  }

  function normalizeLine(value) {
    const line = cleanText(value).toUpperCase();
    return /^[0-9A-Z]+$/.test(line) ? line : '';
  }

  function normalizeUsername(username) {
    const value = cleanText(username).toLowerCase();
    return USERNAME_PATTERN.test(value) ? value : '';
  }

  function parseScaledCoordinate(value, scale) {
    const number = parseNullableNumber(value);
    return number === null ? null : round(number / scale, 6);
  }

  function parseNullableNumber(value) {
    const text = String(value).trim();
    if (text === '') {
      return null;
    }

    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeBearing(bearing) {
    return bearing === null || bearing < 0 || bearing >= 360 ? null : round(bearing, 1);
  }

  function normalizeSpeed(speed) {
    return speed === null || speed < 0 || speed > 140 ? null : round(speed, 1);
  }

  function secondsToClock(seconds) {
    let normalized = seconds % 86400;
    if (normalized < 0) {
      normalized += 86400;
    }

    const hours = Math.floor(normalized / 3600);
    const minutes = Math.floor((normalized % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function cleanText(value) {
    return String(value ?? '').replace(/^\uFEFF/, '').replace(/\s+/gu, ' ').trim();
  }

  function removeBom(value) {
    return String(value ?? '').replace(/^\uFEFF/, '');
  }

  function isTallinnMapCoordinate(lat, lon) {
    return lat >= 59.30 && lat <= 59.52 && lon >= 24.52 && lon <= 25.02;
  }

  function isTallinnTransitCoordinate(lat, lon) {
    return lat >= 59.25 && lat <= 59.65 && lon >= 24.35 && lon <= 25.25;
  }

  function transportTypeFromCode(code) {
    if (code === '1') return 'trolleybus';
    if (code === '3') return 'tram';
    if (code === '4') return '';
    return 'bus';
  }

  function sanitizeTransportType(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'tram') return 'tram';
    if (normalized === 'trol' || normalized === 'trolley' || normalized === 'trolleybus') return 'trolleybus';
    return 'bus';
  }

  function normalizeRouteLine(value, type = 'bus') {
    const normalizedType = sanitizeTransportType(type);
    const cleaned = cleanText(removeBom(value)).replace(/\s*\(.+\)\s*$/, '').toUpperCase();
    const line = normalizedType === 'tram' ? cleaned.replace(/^T(?=\d)/, '') : cleaned;
    return /^[0-9A-Z]+$/.test(line) ? line : '';
  }

  function lineStateKey(line, type = 'bus') {
    return `${sanitizeTransportType(type)}:${normalizeLine(line)}`;
  }

  function shapeTransportName(type) {
    const normalizedType = sanitizeTransportType(type);
    if (normalizedType === 'tram') return 'tram';
    if (normalizedType === 'trolleybus') return 'trol';
    return 'bus';
  }

  function shapeLineName(type, line) {
    const normalizedType = sanitizeTransportType(type);
    const normalizedLine = normalizeLine(String(line || '')).toLowerCase();
    if (normalizedType === 'tram' && !normalizedLine.startsWith('t')) {
      return `t${normalizedLine}`;
    }
    return normalizedLine;
  }

  function shapeMirrorLineName(type, line) {
    const normalizedType = sanitizeTransportType(type);
    const normalizedLine = normalizeLine(String(line || '')).toUpperCase();
    if (normalizedType === 'tram') {
      return normalizedLine.replace(/^T(?=\d)/, '');
    }
    return normalizedLine;
  }

  function routeKey(line, tag) {
    return `${String(line).toUpperCase()}:${String(tag)}`;
  }

  function isOfficialShapeTag(value) {
    return /^[ab]\d*-[ab]\d*(?:_\d+)?$/i.test(String(value).trim());
  }

  function officialDirectionTag(value) {
    const tag = String(value).trim().toLowerCase().split('_')[0];
    if (/^a\d*-b\d*$/.test(tag)) {
      return 'a-b';
    }

    if (/^b\d*-a\d*$/.test(tag)) {
      return 'b-a';
    }

    return tag;
  }

  function round(value, precision) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  window.BussRadarApi = {
    canHandle,
    request,
  };
}());
