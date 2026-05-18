import { mkdir, writeFile } from 'node:fs/promises';

const DATA_BASE = 'https://transport.tallinn.ee';
const LIVE_DIR = 'data/live';
const SHAPES_DIR = `${LIVE_DIR}/shapes`;

await mkdir(SHAPES_DIR, { recursive: true });

const [gps, stops, routes] = await Promise.all([
  downloadText(`${DATA_BASE}/gps.txt`, `${LIVE_DIR}/gps.txt`),
  downloadText(`${DATA_BASE}/data/stops.txt`, `${LIVE_DIR}/stops.txt`),
  downloadText(`${DATA_BASE}/data/routes.txt`, `${LIVE_DIR}/routes.txt`),
]);

const lines = routeLines(routes);
const fetchedShapes = [];

for (const line of lines) {
  const url = `${DATA_BASE}/data/tallinna-linn_bus_${encodeURIComponent(line)}.txt`;
  const path = `${SHAPES_DIR}/${line}.txt`;

  try {
    const shape = await fetchText(url);
    await writeFile(path, shape, 'utf8');
    fetchedShapes.push(line);
  } catch (error) {
    console.warn(`Shape ${line} skipped: ${error.message}`);
  }
}

await writeFile(`${LIVE_DIR}/manifest.json`, JSON.stringify({
  updatedAt: new Date().toISOString(),
  source: DATA_BASE,
  vehiclesBytes: gps.length,
  stopsBytes: stops.length,
  routesBytes: routes.length,
  shapeLines: fetchedShapes,
}, null, 2), 'utf8');

console.log(`Updated transit mirror: ${fetchedShapes.length} route shape files.`);

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

function routeLines(raw) {
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

    if (currentLine && (!currentTransport || currentTransport === 'bus') && cleanText(row[13])) {
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
