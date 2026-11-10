// The engine: one WASM module, loaded once, that does both halves of the work.
//
// `xfina` reads each publisher's download into a price series; `xfingine` is
// the computation layer. Neither depends on the other, so the module that puts
// them together lives here, in Labs, and is built from `engine/` by
// `npm run build:wasm`. See engine/src/lib.rs for the surface and
// engine/src/portfolio/mod.rs for where the computation half will move to once
// xfina-dev/xfingine#15 publishes its portfolio engine API.
//
// Everything runs in this tab. The files a user imports are read here, the
// parsed series stay inside the module, and nothing is uploaded.
import init, { readFile as wasmReadFile, dropFile, clearFiles, fileCsv, run as wasmRun, version } from './engine-pkg/engine.js';

let loading = null;
// The module is a megabyte of WebAssembly, so it is fetched on first use rather
// than with the page: importing a file or pressing Run is what needs it.
export function engineReady() {
  loading ||= init().then(() => version());
  return loading;
}

/// What the module was built from, for the footer and the exported JSON.
export const versions = { engine: null, xfina: null, xfingine: null, engineApi: null };
engineReady().then((v) => Object.assign(versions, v)).catch(() => {});

/// Reads one file. Resolves to the module's report, or to `{ error }`.
export async function readFile(file) {
  await engineReady();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return wasmReadFile(bytes, { filename: file.name, modifiedTimestamp: Math.round(file.lastModified / 1000) });
}

export { dropFile, clearFiles, fileCsv };

/// Runs a backtest. Resolves to the run, or to `{ error }`.
export async function runBacktest(request) {
  await engineReady();
  return wasmRun(request);
}

// --- Reference series -------------------------------------------------------
// USD/INR and inflation come from Xfina Data as two-column CSVs, fetched here
// and handed to the engine as points: they are published files, not imports, so
// the parsers have nothing to work out about them.
const DATA = 'https://data.xfina.dev';
const cache = new Map();

export async function referencePoints(path) {
  if (!path) return [];
  if (cache.has(path)) return cache.get(path);
  const points = (async () => {
    const text = await (await fetch(`${DATA}/${path}`)).text();
    return parsePoints(text);
  })();
  cache.set(path, points);
  try {
    return await points;
  } catch (e) {
    cache.delete(path);
    throw e;
  }
}

// `date,value` with a heading row; a rate sheet has a buy and a sell column, in
// which case their mid-point is the rate. Anything unparseable is skipped
// rather than passed on as a zero.
export function parsePoints(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const dateAt = Math.max(0, head.findIndex((h) => h === 'date' || h === 'month'));
  const columns = head.map((h, i) => (i === dateAt ? -1 : i)).filter((i) => i >= 0);
  const out = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const date = (cells[dateAt] || '').trim();
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(date)) continue;
    const values = columns.map((i) => Number(cells[i])).filter((v) => Number.isFinite(v) && v > 0);
    if (!values.length) continue;
    out.push([date, values.reduce((a, b) => a + b, 0) / values.length]);
  }
  return out;
}
