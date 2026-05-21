import { mkdir, writeFile } from 'node:fs/promises';

const DATA_BASE = 'https://transport.tallinn.ee';
const LIVE_DIR = 'data/live';
const SHAPES_DIR = `${LIVE_DIR}/shapes`;
const TRAM_SHAPES_DIR = `${SHAPES_DIR}/tram`;

await mkdir(SHAPES_DIR, { recursive: true });
await mkdir(TRAM_SHAPES_DIR, { recursive: true });

const [gps, stops, routes] = await Promise.all([
  downloadText(`${DATA_BASE}/gps.txt`, `${LIVE_DIR}/gps.txt`),
  downloadText(`${DATA_BASE}/data/stops.txt`, `${LIVE_DIR}/stops.txt`),
  downloadText(`${DATA_BASE}/data/routes.txt`, `${LIVE_DIR}/routes.txt`),
]);

const fetchedShapes = {
  bus: [],
  tram: [],
};

for (const type of ['bus', 'tram']) {
  for (const line of routeLines(routes, type)) {
    const url = `${DATA_BASE}/data/tallinna-linn_${type}_${encodeURIComponent(line)}.txt`;
    const path = type === 'tram' ? `${TRAM_SHAPES_DIR}/${line}.txt` : `${SHAPES_DIR}/${line}.txt`;

    try {
      const shape = await fetchText(url);
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
}, null, 2), 'utf8');

console.log(`Updated transit mirror: ${fetchedShapes.bus.length} bus and ${fetchedShapes.tram.length} tram shape files.`);

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

    const matchesTransport = currentTransport === wantedTransport || (wantedTransport === 'bus' && currentTransport === '');
    if (currentLine && matchesTransport && cleanText(row[13])) {
      lines.add(currentLine);
    }
  });

  return [...lines].sort((a, b) => a.localeCompare(b, 'et', { numeric: true }));
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
