(function () {
  const USERS_KEY = 'bussradar.staticUsers';
  const SESSION_KEY = 'bussradar.staticSession';
  const DATA_BASE = 'https://transport.tallinn.ee';
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
      case 'mapStops':
        return handleMapStops();
      case 'routes':
        return handleRoutes(parsed.searchParams);
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
    const lineFilter = normalizeLineList(params.get('lines') || '');
    const wantedType = cleanText(params.get('type') || 'bus').toLowerCase();
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
    const stops = parseTallinnStops(raw, query, false).slice(0, 18);

    return {
      ok: true,
      source: `${DATA_BASE}/data/stops.txt`,
      stops,
    };
  }

  async function handleMapStops() {
    const raw = await fetchText(`${DATA_BASE}/data/stops.txt`, { ttl: 60 * 60 * 1000 });
    const stops = parseStructuredStops(raw).filter((stop) => isTallinnMapCoordinate(stop.lat, stop.lon));

    return {
      ok: true,
      source: `${DATA_BASE}/data/stops.txt`,
      updatedAt: new Date().toISOString(),
      stops,
    };
  }

  async function handleRoutes(params) {
    const lineFilter = normalizeLineList(params.get('lines') || '');
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

    const stopRoutes = parseRouteLines(routesRaw, stopsByPlatformId, lineFilter);
    const shapeRoutes = await parseOfficialLineShapeRoutes(lineFilter);
    const routes = mergeShapeRoutesWithStops(shapeRoutes, stopRoutes);

    return {
      ok: true,
      source: `${DATA_BASE}/data/tallinna-linn_bus_<line>.txt`,
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

    localStorage.setItem(SESSION_KEY, username);
    return authPayload(username);
  }

  async function handleRegister(options) {
    const payload = await requestPayload(options);
    const username = normalizeUsername(payload.username || '');
    const password = String(payload.password || '');

    if (!username) {
      throw new Error('Kasutajanimi võib sisaldada tähti, numbreid, punkti, alakriipsu ja sidekriipsu.');
    }

    if (password.length < 4) {
      throw new Error('Parool peab olema vähemalt 4 märki.');
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
    localStorage.setItem(SESSION_KEY, username);

    return authPayload(username);
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
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
      localStorage.removeItem(SESSION_KEY);
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
      localStorage.removeItem(SESSION_KEY);
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
      user: { username },
      preferences: normalizePreferences(user.preferences || {}),
    };
  }

  function currentUsername() {
    return normalizeUsername(localStorage.getItem(SESSION_KEY) || '');
  }

  function readUserStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
      return parsed && typeof parsed === 'object' && parsed.users && typeof parsed.users === 'object'
        ? parsed
        : { users: {} };
    } catch {
      return { users: {} };
    }
  }

  function writeUserStore(store) {
    localStorage.setItem(USERS_KEY, JSON.stringify({
      users: store.users && typeof store.users === 'object' ? store.users : {},
    }));
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
      stop: null,
      favoriteStops: [],
      lineColors: {},
      lineEmphasis: {},
      theme: 'light',
    };
  }

  function normalizePreferences(payload) {
    const preferences = defaultPreferences();
    const lines = Array.isArray(payload.lines)
      ? payload.lines
      : String(payload.lines || '').split(/[\s,;]+/);

    preferences.lines = [...new Set(lines.map((line) => normalizeLine(String(line))).filter(Boolean))];
    preferences.stop = normalizePreferenceStop(payload.stop);
    preferences.favoriteStops = Array.isArray(payload.favoriteStops)
      ? payload.favoriteStops.map(normalizePreferenceStop).filter(Boolean)
      : [];
    preferences.lineColors = Object.fromEntries(
      Object.entries(payload.lineColors || {})
        .map(([line, color]) => [normalizeLine(line), String(color)])
        .filter(([line, color]) => line && /^#[0-9a-f]{6}$/i.test(color))
    );
    preferences.lineEmphasis = Object.fromEntries(
      Object.entries(payload.lineEmphasis || {})
        .map(([line, value]) => [normalizeLine(line), clamp(Number(value), 0, 1)])
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

  function proxyUrls(url) {
    const custom = window.BUSSRADAR_CORS_PROXY || localStorage.getItem('bussradar.corsProxy') || '';
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

      const shape = parsed.pathname.match(/^\/data\/tallinna-linn_bus_([^/]+)\.txt$/);
      if (shape) {
        return `data/live/shapes/${encodeURIComponent(shape[1])}.txt`;
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
      .filter((vehicle) => vehicle.id && vehicle.line && vehicle.lat !== null && vehicle.lon !== null)
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

  function parseRouteLines(raw, stopsByPlatformId, lineFilter) {
    const rows = tableRows(raw, ';');
    const routes = [];
    let currentLine = '';
    let currentTransport = '';

    rows.slice(1).forEach((sourceRow) => {
      const row = padRow(sourceRow, 14);
      const line = cleanText(removeBom(row[0]));
      const transport = cleanText(row[3]).toLowerCase();

      if (line) {
        const normalized = line.toUpperCase();
        if (!/^[0-9A-Z]+$/.test(normalized)) {
          return;
        }
        currentLine = normalized;
      }

      if (transport) {
        currentTransport = transport;
      }

      const routeStopsRaw = cleanText(row[13]);
      if (!currentLine || !routeStopsRaw || !lineFilter.includes(currentLine)) {
        return;
      }

      if (currentTransport && currentTransport !== 'bus') {
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
          name: stop.name,
          lat: stop.lat,
          lon: stop.lon,
        }));

      if (stops.length < 2) {
        return;
      }

      routes.push({
        line: currentLine,
        tag: cleanText(row[8]),
        name: cleanText(row[10]),
        points: stops.map((stop) => [stop.lat, stop.lon]),
        stops,
      });
    });

    return routes;
  }

  async function parseOfficialLineShapeRoutes(lineFilter) {
    const groups = await Promise.all(lineFilter.map(async (line) => {
      const url = `${DATA_BASE}/data/tallinna-linn_bus_${encodeURIComponent(line)}.txt`;
      try {
        const raw = await fetchText(url, { ttl: 60 * 60 * 1000 });
        return parseOfficialLineShapeFile(line, raw);
      } catch {
        return [];
      }
    }));

    return groups.flat().sort((a, b) => {
      return String(a.line).localeCompare(String(b.line), 'et', { numeric: true })
        || String(a.tag).localeCompare(String(b.tag), 'et');
    });
  }

  function parseOfficialLineShapeFile(line, raw) {
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
    const modes = ['bus', 'tram', 'trolley', 'trolleybus', 'train'];
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
        type: mode,
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

  function normalizeLineList(input) {
    return [...new Set(String(input).toUpperCase().trim().split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter((item) => /^[0-9A-Z]+$/.test(item)))];
  }

  function normalizeLine(value) {
    const line = cleanText(value).toUpperCase();
    return /^[0-9A-Z]+$/.test(line) ? line : '';
  }

  function normalizeUsername(username) {
    const value = cleanText(username).toLowerCase();
    return /^[a-z0-9._-]{2,32}$/.test(value) ? value : '';
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
    return 'bus';
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
