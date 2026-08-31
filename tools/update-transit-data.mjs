import { mkdir, writeFile } from 'node:fs/promises';

const DATA_BASE = 'https://transport.tallinn.ee';
const LIVE_DIR = 'data/live';
const SHAPES_DIR = `${LIVE_DIR}/shapes`;
const TRAM_SHAPES_DIR = `${SHAPES_DIR}/tram`;
const TROLLEY_SHAPES_DIR = `${SHAPES_DIR}/trolleybus`;

await mkdir(SHAPES_DIR, { recursive: true });
await mkdir(TRAM_SHAPES_DIR, { recursive: true });
await mkdir(TROLLEY_SHAPES_DIR, { recursive: true });

const [gps, stops, routes] = await Promise.all([
  downloadText(`${DATA_BASE}/gps.txt`, `${LIVE_DIR}/gps.txt`),
  downloadText(`${DATA_BASE}/data/stops.txt`, `${LIVE_DIR}/stops.txt`),
  downloadText(`${DATA_BASE}/data/routes.txt`, `${LIVE_DIR}/routes.txt`),
]);

const fetchedShapes = {
  bus: [],
  tram: [],
  trolleybus: [],
};

for (const type of ['bus', 'tram', 'trolleybus']) {
  for (const line of routeLines(routes, type)) {
    const url = `${DATA_BASE}/data/tallinna-linn_${shapeTransportName(type)}_${encodeURIComponent(shapeLineName(type, line))}.txt`;
    const path = type === 'tram'
      ? `${TRAM_SHAPES_DIR}/${line}.txt`
      : type === 'trolleybus'
        ? `${TROLLEY_SHAPES_DIR}/${line}.txt`
        : `${SHAPES_DIR}/${line}.txt`;

    try {
      const shape = normalizeShapeText(await fetchText(url));
      await writeFile(path, shape, 'utf8');
      fetchedShapes[type].push(line);
    } catch (error) {
      console.warn(`${type} shape ${line} skipped: ${error.message}`);
    }
  }
}

await writeFile(`${LIVE_DIR}/manifest.json`, JSON.stringify({
  updatedAt: new Date().toISOString(),
  source: DATA_BASE,
  vehiclesBytes: gps.length,
  stopsBytes: stops.length,
  routesBytes: routes.length,
  shapeLines: fetchedShapes.bus,
  tramShapeLines: fetchedShapes.tram,
  trolleyShapeLines: fetchedShapes.trolleybus,
}, null, 2), 'utf8');

console.log(`Updated transit mirror: ${fetchedShapes.bus.length} bus, ${fetchedShapes.tram.length} tram and ${fetchedShapes.trolleybus.length} trolley shape files.`);

async function downloadText(url, path) {
  const text = await fetchText(url);
  await writeFile(path, text, 'utf8');
  return text;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'BussRadar Tallinn static mirror',
      'Accept': 'text/plain,*/*',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function routeLines(raw, wantedTransport = 'bus') {
  const lines = new Set();
  let currentLine = '';
  let currentTransport = '';

  tableRows(raw, ';').slice(1).forEach((sourceRow) => {
    const row = padRow(sourceRow, 14);
    const rawTransport = cleanText(row[3]).toLowerCase();
    const transport = rawTransport ? sanitizeTransportType(rawTransport) : '';
    const line = normalizeRouteLine(row[0], transport || currentTransport || wantedTransport);

    if (line) {
      currentLine = line;
    }

    if (transport) {
      currentTransport = transport;
    }

    const matchesTransport = currentTransport === wantedTransport || (wantedTransport === 'bus' && currentTransport === '');
    if (currentLine && matchesTransport && cleanText(row[13])) {
      lines.add(currentLine);
    }
  });

  return [...lines].sort((a, b) => a.localeCompare(b, 'et', { numeric: true }));
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

function shapeTransportName(type) {
  const normalized = sanitizeTransportType(type);
  if (normalized === 'tram') return 'tram';
  if (normalized === 'trolleybus') return 'trol';
  return 'bus';
}

function shapeLineName(type, line) {
  const normalizedType = sanitizeTransportType(type);
  const normalizedLine = cleanText(line).replace(/\s*\(.+\)\s*$/, '').replace(/[^0-9A-Za-z]/g, '').toLowerCase();
  if (normalizedType === 'tram' && !normalizedLine.startsWith('t')) {
    return `t${normalizedLine}`;
  }
  return normalizedLine;
}

function normalizeShapeText(text) {
  return `${String(text).split(/\r\n|\r|\n/).map((line) => line.trimEnd()).join('\n').trimEnd()}\n`;
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

function cleanText(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/\s+/gu, ' ').trim();
}

function removeBom(value) {
  return String(value ?? '').replace(/^\uFEFF/, '');
}
