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

/// What the module was built from, for the footer and the exported JSON, and
/// for telling a stored reading of a file apart from what this build would
/// make of it. Filled once the module loads; until then the page has not
/// needed it.
export const versions = { engine: null, xfina: null, xfingine: null, engineApi: null, parserRevision: null };

let loading = null;
let ready = false;
// The module is a megabyte of WebAssembly, so it is fetched on first use rather
// than with the page. Nothing loads it to draw: the import table and the run
// history come back from storage on their own (imports.js, store.js), and the
// module is fetched when a file's bytes have to be parsed -- an import, or a
// run that needs a series it does not hold.
export function engineReady() {
  // The versions are filled here, not by each caller: anything that waits for
  // the module can then ask what it is, and `versions` is never half-set.
  loading ||= init().then(() => {
    ready = true;
    Object.assign(versions, version());
    return versions;
  });
  return loading;
}
/// Whether the module is loaded, for the few calls that are pointless before it
/// is: there is nothing to clear in a module that was never started.
export const engineLoaded = () => ready;

/// Reads one file's bytes. Resolves to the module's report, or to `{ error }`.
export async function readBytes(bytes, filename, modifiedTimestamp) {
  await engineReady();
  return wasmReadFile(bytes, { filename, modifiedTimestamp });
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
