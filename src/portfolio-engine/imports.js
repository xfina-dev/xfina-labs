// The files a user has imported, and which asset each one belongs to.
//
// A dataset usually arrives in pieces, because that is how the publishers serve
// it: a year of NSE index history per download, at most five years of AMFI
// NAVs. `xfina` reads one file per call and says so -- putting the pieces back
// together is not parsing -- so this module does the putting together on the
// page's side: files that report the same instrument from the same publisher
// are one series, and a series belongs to one asset in the catalogue.
//
// Nothing is uploaded. The bytes go to the WASM module in this tab, the parsed
// series stay inside it, and this module keeps only what the table shows.
import { reactive } from 'vue';
import { readFile, dropFile } from './engine.js';
import { nodes } from './guide.js';

// key `region|class|asset` → [series]. A series is
// `{ key, name, type, ret, basis, ccy, origin, files: [...], ids: [...], from, to }`,
// the same shape Select Assets reads, with `ids` the engine's handles.
export const imported = reactive({ byAsset: {}, unmatched: [], busy: false });

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);

// Every instrument in the catalogue, flattened once, with the asset it belongs
// to: what an imported file is matched against.
const INSTRUMENTS = nodes.flatMap((n) =>
  n.instruments.map((i) => ({
    assetKey: `${n.region}|${n.class}|${n.asset}`,
    asset: n.asset,
    vehicle: n.vehicle,
    code: i.code ? norm(i.code) : null,
    name: norm(i.name),
    kind: i.kind,
  })),
);
// An index file names the index, not an instrument, so the asset's own name is
// a match too ("NIFTY 50" → Nifty 50).
const ASSETS = [...new Map(nodes.map((n) => [`${n.region}|${n.class}|${n.asset}`, { assetKey: `${n.region}|${n.class}|${n.asset}`, asset: n.asset, name: norm(n.asset) }])).values()];

// Which asset a parsed file belongs to.
//
// The publishers identify an instrument in their own terms -- a symbol, an AMFI
// scheme name, an index name -- so the match is tried in order of how much it
// proves: an exchange symbol or scheme code first, then the instrument's full
// name, then the index's name against the asset's.
export function matchAsset(report) {
  const code = norm(report.code);
  const name = norm(report.name || report.code);
  if (code) {
    const bySymbol = INSTRUMENTS.find((i) => i.code && i.code === code);
    if (bySymbol) return { assetKey: bySymbol.assetKey, how: 'symbol' };
  }
  for (const text of [name, code]) {
    if (!text) continue;
    const byName = INSTRUMENTS.find((i) => i.name === text || i.name.includes(text) || text.includes(i.name));
    if (byName) return { assetKey: byName.assetKey, how: 'name' };
  }
  // An index: match the asset's own name, longest first, so "Nifty Next 50"
  // wins over "Nifty 50" for a file that names both.
  const candidates = [...ASSETS].sort((a, b) => b.name.length - a.name.length);
  for (const text of [name, code]) {
    if (!text) continue;
    const hit = candidates.find((a) => text === a.name || text.includes(a.name));
    if (hit) return { assetKey: hit.assetKey, how: 'index name' };
  }
  // A last pass on words, for a file whose name carries the index with the
  // publisher's own wording around it.
  const bag = new Set([...words(name), ...words(code), ...words(report.filename)]);
  const hit = candidates.find((a) => words(a.name).every((w) => bag.has(w)));
  return hit ? { assetKey: hit.assetKey, how: 'filename' } : null;
}

// The type badge the table shows, from what the file itself said.
const TYPE = { index: 'Index', etf: 'ETF', mutual_fund: 'MF', listed_security: 'ETF', commodity_spot: 'Spot' };
const typeOf = (report) => TYPE[report.kind] ?? (report.headline === 'nav' ? 'MF' : report.headline.startsWith('total') ? 'Index' : 'Price');

// Which series a file joins: the same instrument from the same publisher. A
// file that names nothing identifiable (several publishers put nothing in the
// file at all) falls back to its own name, so it stands alone rather than
// joining somebody else's history.
const seriesKey = (report) => `${report.source}|${norm(report.code) || norm(report.name) || report.filename}`;

/// Reads the picked files and files them under their assets.
///
/// Returns a summary for the page to show: how many files were read, how many
/// could not be, and anything that parsed but matched no asset.
export async function importFiles(files) {
  imported.busy = true;
  const errors = [];
  let read = 0;
  try {
    for (const file of files) {
      let report;
      try {
        report = await readFile(file);
      } catch (e) {
        errors.push({ name: file.name, message: String(e?.message || e) });
        continue;
      }
      if (report?.error) {
        errors.push({ name: file.name, message: report.error.message, kind: report.error.kind });
        continue;
      }
      report.filename ||= file.name;
      read += 1;
      place(report);
    }
  } finally {
    imported.busy = false;
  }
  return { read, errors, unmatched: imported.unmatched.length };
}

function place(report) {
  const match = matchAsset(report);
  if (!match) {
    imported.unmatched.push({
      id: report.id,
      filename: report.filename,
      publisher: report.publisher,
      code: report.code || report.name || null,
      from: report.from,
      to: report.to,
      rows: report.rows,
    });
    return;
  }
  const list = (imported.byAsset[match.assetKey] ||= []);
  const key = seriesKey(report);
  let series = list.find((s) => s.key === key);
  if (!series) {
    series = reactive({
      key,
      name: report.name || report.code || report.filename,
      type: typeOf(report),
      ret: report.ret,
      basis: report.basis,
      ccy: report.currency,
      source: report.source,
      publisher: report.publisher,
      origin: 'imported',
      matchedBy: match.how,
      files: [],
      from: null,
      to: null,
    });
    list.push(series);
  }
  // Importing the same file again replaces it rather than doubling its rows.
  const existing = series.files.findIndex((f) => f.name === report.filename);
  const entry = {
    id: report.id,
    name: report.filename,
    from: report.from,
    to: report.to,
    rows: report.rows,
    status: report.status,
    checks: report.checks,
  };
  if (existing >= 0) {
    dropFile(series.files[existing].id);
    series.files.splice(existing, 1, entry);
  } else {
    series.files.push(entry);
  }
  series.files.sort((a, b) => String(a.from).localeCompare(String(b.from)));
  respan(series);
}

// A series spans its valid files; an invalid one is listed but not used.
function respan(series) {
  const ok = series.files.filter((f) => f.status !== 'err');
  series.from = ok.map((f) => f.from).sort()[0] ?? null;
  series.to = ok.map((f) => f.to).sort().at(-1) ?? null;
}

/// Removes one file, or a whole series, and tells the engine to forget it.
export function removeFile(assetKey, seriesKey_, fileId) {
  const list = imported.byAsset[assetKey] || [];
  const series = list.find((s) => s.key === seriesKey_);
  if (!series) return;
  const i = series.files.findIndex((f) => f.id === fileId);
  if (i < 0) return;
  dropFile(fileId);
  series.files.splice(i, 1);
  if (!series.files.length) list.splice(list.indexOf(series), 1);
  else respan(series);
  if (!list.length) delete imported.byAsset[assetKey];
}

/// The engine handles of every valid file behind a series, which is what a run
/// passes for that asset.
export const handlesOf = (series) => series.files.filter((f) => f.status !== 'err').map((f) => f.id);

export const seriesFor = (assetKey) => imported.byAsset[assetKey] || [];
