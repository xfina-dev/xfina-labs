// The files a user has imported, which asset each one belongs to, and what
// keeps them between visits.
//
// A dataset usually arrives in pieces, because that is how the publishers serve
// it: a year of NSE index history per download, at most five years of AMFI
// NAVs. `xfina` reads one file per call and says so -- putting the pieces back
// together is not parsing -- so this module does the putting together on the
// page's side: files that report the same instrument from the same publisher
// are one series, and a series belongs to one asset in the catalogue.
//
// Imports are kept in this browser (vault.js, IndexedDB), in two halves: what
// the table shows, and the files themselves. A reload reads the first and draws
// the table; the bytes go into the WASM module only when a run needs the parsed
// series. That is why `load` never touches the engine and `resident` does.
//
// Nothing is uploaded. The bytes go to the WASM module in this tab, the parsed
// series stay inside it, and IndexedDB is this browser's alone.
import { reactive } from 'vue';
import { readBytes, dropFile, clearFiles, engineLoaded, engineReady, versions } from './engine.js';
import * as vault from './vault.js';
import { nodes } from './guide.js';
import * as matching from './matching.js';

// key `region|class|asset` → [series]. A series is
// `{ key, name, type, ret, basis, ccy, origin, files: [...], from, to }`,
// the same shape Select Assets reads. A file's `id` is its content's, stable
// across visits; the engine's own handle for it lives in `RESIDENT`.
export const imported = reactive({
  byAsset: {},
  unmatched: [],
  busy: false,
  // Whether what is stored has been read back yet, so the table can say
  // "restoring" rather than "nothing imported" for the moment it takes.
  loaded: false,
  storage: { files: 0, stored: 0, used: null, quota: null },
  // Set when the browser refused a write: the imports already in are untouched,
  // and the page says so rather than losing them quietly.
  storageError: null,
  persisted: false,
  // Re-reading stored files because this build reads them differently.
  refreshing: false,
});

const norm = matching.norm;
// The catalogue, flattened once: what an imported file is matched against
// (matching.js, which takes it as an argument so it can be tested on its own).
const CATALOGUE = matching.catalogue(nodes);

/// Which asset a parsed file belongs to. See matching.js for the passes and for
/// what a match does and does not decide.
export const matchAsset = (report) => matching.matchAsset(report, CATALOGUE);

// The type badge the table shows, from what the file itself said.
const TYPE = { index: 'Index', etf: 'ETF', mutual_fund: 'MF', listed_security: 'ETF', commodity_spot: 'Spot' };
const typeOf = (report) => TYPE[report.kind] ?? (report.headline === 'nav' ? 'MF' : String(report.headline).startsWith('total') ? 'Index' : 'Price');

// What currency a series is in.
//
// Most publishers print it, or only ever quote one market, and then it is
// theirs. Tiingo, WSJ and Yahoo quote several and print none, so it comes from
// the asset the file matched instead: the catalogue's India assets are in
// rupees and its US and Global ones in dollars, which is what those tabs say.
// An inferred currency is marked, and Select Assets shows it, because the
// difference decides whether a series is converted before a run.
function currencyOf(report, assetKey) {
  if (report.currency) return { ccy: report.currency, assumed: false };
  const region = String(assetKey || '').split('|')[0];
  return { ccy: region === 'india' ? 'INR' : 'USD', assumed: true };
}

// Which series a file joins: the same instrument from the same publisher. A
// file that names nothing identifiable (several publishers put nothing in the
// file at all) falls back to its own name, so it stands alone rather than
// joining somebody else's history.
const seriesKey = (report) => `${report.source}|${norm(report.code) || norm(report.name) || report.filename}`;

// --- Residency -------------------------------------------------------------
// A file's id is its content's and outlives the tab; the engine's handle for it
// does not, because the module starts empty on every load. This is the map
// between them, and it is empty until something asks for a parsed series.
const RESIDENT = new Map(); // file id → the engine's handle

/// Puts the given files' bytes into the engine, parsing only what is not
/// already there, and returns `id → handle` for all of them.
///
/// This is the only path that needs the WASM module, so it is the only one that
/// waits for it. A file whose bytes have gone (a cleared store, an eviction) is
/// reported rather than silently left out of a run.
export async function resident(ids) {
  await engineReady();
  syncBuild();
  const missing = [...new Set(ids)].filter((id) => !RESIDENT.has(id));
  const gone = [];
  for (const id of missing) {
    const bytes = await vault.bytesOf(id);
    const record = RECORDS.get(id);
    if (!bytes) { gone.push(record?.filename ?? id); continue; }
    const report = await readBytes(bytes, record?.filename ?? null, record?.modified ?? null);
    if (report?.error) { gone.push(record?.filename ?? id); continue; }
    RESIDENT.set(id, report.id);
    // The stored report is a drawing cache, not the truth: the truth is the
    // bytes. A parser newer than the one that first read this file may read it
    // differently, so what it says now replaces what was stored.
    if (record && record.engineVersion !== versionTag()) {
      report.filename = record.filename;
      const next = { ...record, report, engineVersion: versionTag() };
      RECORDS.set(id, next);
      vault.patch(next).catch(() => {});
      refile();
    }
  }
  if (gone.length) throw new Error(`${gone.join(', ')}: the stored file could not be read back. Import it again.`);
  return new Map(ids.map((id) => [id, RESIDENT.get(id)]));
}

// What read a file, so a report stored by an older parser can be spotted. The
// parser revision is the part that matters: it is bumped whenever a file would
// come back read or checked differently (PARSER_REVISION in engine/src/lib.rs).
//
// Only the loaded module can say what it is, and a reload must not load it just
// to ask -- drawing the table without the engine is the whole point of keeping
// the metadata apart. So the last answer it gave is remembered here, and a
// reload compares the stored readings against that, which costs nothing. A
// build that would answer differently is noticed the first time the module is
// loaded for some other reason, and the stored readings are re-made then.
const BUILD_KEY = 'xfina_labs_portfolio_engine_build';
const versionTag = () => `${versions.engine ?? '?'}/${versions.xfina ?? '?'}/r${versions.parserRevision ?? '?'}`;
const rememberedTag = () => { try { return localStorage.getItem(BUILD_KEY); } catch { return null; } };

/// Called whenever the module is up: notes what this build calls itself, and
/// re-reads the stored files when that is not what read them.
function syncBuild() {
  const tag = versionTag();
  if (rememberedTag() === tag) return;
  try { localStorage.setItem(BUILD_KEY, tag); } catch { /* this visit only */ }
  if ([...RECORDS.values()].some((r) => r.engineVersion !== tag)) refreshStale(tag);
}

// --- The imports themselves --------------------------------------------------
// Every import's metadata by id, which is what the table is built from.
const RECORDS = new Map();

/// Reads back what this browser has stored and draws it.
///
/// Deliberately free of the engine: a reload shows the whole table, and the run
/// history with it, without a megabyte of WebAssembly being fetched to do it.
export async function load() {
  try {
    for (const record of await vault.allImports()) RECORDS.set(record.id, record);
    refile();
    imported.persisted = await vault.persist();
    await refreshUsage();
  } finally {
    imported.loaded = true;
  }
  // A stored report is a drawing cache, and a reload draws from it without
  // going near the engine. Whether this build would read those files the same
  // way is answered against the build the page last saw, so asking costs
  // nothing; a record older than that is re-read now, because a file a new
  // check rejects must not sit there looking fine.
  const tag = rememberedTag();
  if (tag && [...RECORDS.values()].some((r) => r.engineVersion !== tag)) refreshStale(tag);
}

/// Re-reads the files whose stored report came from a different build.
async function refreshStale(expected) {
  imported.refreshing = true;
  try {
    await engineReady();
    // The module's own answer wins over what was remembered of it.
    const tag = versionTag();
    if (tag !== expected) { try { localStorage.setItem(BUILD_KEY, tag); } catch { /* this visit only */ } }
    for (const record of [...RECORDS.values()]) {
      if (record.engineVersion === tag) continue;
      const bytes = await vault.bytesOf(record.id);
      if (!bytes) continue;
      const report = await readBytes(bytes, record.filename, record.modified);
      if (report?.error) continue;
      report.filename = record.filename;
      const next = { ...record, report, engineVersion: tag };
      RECORDS.set(record.id, next);
      RESIDENT.set(record.id, report.id);
      await vault.patch(next);
    }
    refile();
  } catch { /* the files are still there; the table just shows the older reading */ } finally {
    imported.refreshing = false;
  }
}

async function refreshUsage() {
  imported.storage = await vault.usage();
}

/// Reads the picked files and files them under their assets.
///
/// Returns a summary for the page to show: how many files were read, how many
/// were already in, how many could not be read, and anything that parsed but
/// matched no asset.
export async function importFiles(files) {
  imported.busy = true;
  imported.storageError = null;
  const errors = [];
  let read = 0;
  let already = 0;
  try {
    for (const file of files) {
      let bytes;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch (e) {
        errors.push({ name: file.name, message: String(e?.message || e) });
        continue;
      }
      const id = await vault.fileId(bytes);
      // The same bytes twice is the same file, whatever it was called the
      // second time: nothing to parse and nothing to store.
      if (RECORDS.has(id)) { already += 1; continue; }

      let report;
      try {
        report = await readBytes(bytes, file.name, Math.round(file.lastModified / 1000));
        syncBuild();
      } catch (e) {
        errors.push({ name: file.name, message: String(e?.message || e) });
        continue;
      }
      if (report?.error) {
        // A file the parsers do not recognise is not stored: there is nothing
        // to show about it and nothing a run could do with it.
        errors.push({ name: file.name, message: report.error.message, kind: report.error.kind });
        continue;
      }
      report.filename ||= file.name;
      RESIDENT.set(id, report.id);
      const record = {
        id,
        filename: file.name,
        size: file.size,
        modified: Math.round(file.lastModified / 1000),
        savedAt: Date.now(),
        engineVersion: versionTag(),
        report,
      };
      RECORDS.set(id, record);
      read += 1;
      try {
        await vault.put(record, bytes);
      } catch (e) {
        // Out of room: this file still works for this visit, and everything
        // already stored is untouched. The page says so rather than pretending.
        imported.storageError = e instanceof vault.StorageFull
          ? 'This browser is out of storage, so new imports last only for this visit. Clear some imports, or free space, to keep them.'
          : `This browser would not store the import: ${String(e?.message || e)}`;
      }
    }
    refile();
    await refreshUsage();
  } finally {
    imported.busy = false;
  }
  return { read, already, errors, unmatched: imported.unmatched.length };
}

// Rebuilds the table from the records. One path, whether a record has just been
// imported or has just been read back from storage, so the two can never draw
// differently.
function refile() {
  const byAsset = {};
  const unmatched = [];
  // Newest wins for a filename within a series, so a corrected re-download
  // replaces the file it corrects.
  for (const record of [...RECORDS.values()].sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0))) {
    const report = record.report;
    const match = matchAsset(report);
    // No asset, or several that do not agree: either way the file is not filed,
    // and an ambiguity says which entries it could have been rather than
    // leaving the user to guess why a fund the catalogue lists was not taken.
    if (!match || !match.assetKey) {
      unmatched.push({
        id: record.id,
        filename: record.filename,
        publisher: report.publisher,
        code: report.code || report.name || null,
        from: report.from,
        to: report.to,
        rows: report.rows,
        ambiguous: match?.ambiguous ?? null,
      });
      continue;
    }
    const list = (byAsset[match.assetKey] ||= []);
    const key = seriesKey(report);
    let series = list.find((s) => s.key === key);
    if (!series) {
      const currency = currencyOf(report, match.assetKey);
      series = {
        key,
        name: report.name || report.code || record.filename,
        type: typeOf(report),
        ret: report.ret,
        basis: report.basis,
        ccy: currency.ccy,
        ccyAssumed: currency.assumed,
        source: report.source,
        publisher: report.publisher,
        origin: 'imported',
        matchedBy: match.how,
        files: [],
        from: null,
        to: null,
      };
      list.push(series);
    }
    const entry = {
      id: record.id,
      name: record.filename,
      size: record.size,
      from: report.from,
      to: report.to,
      rows: report.rows,
      status: report.status,
      checks: report.checks,
    };
    const same = series.files.findIndex((f) => f.name === entry.name);
    if (same >= 0) series.files.splice(same, 1, entry);
    else series.files.push(entry);
  }
  for (const list of Object.values(byAsset)) {
    for (const series of list) {
      series.files.sort((a, b) => String(a.from).localeCompare(String(b.from)));
      const ok = series.files.filter((f) => f.status !== 'err');
      series.from = ok.map((f) => f.from).sort()[0] ?? null;
      series.to = ok.map((f) => f.to).sort().at(-1) ?? null;
    }
  }
  imported.byAsset = byAsset;
  imported.unmatched = unmatched;
}

/// Removes one file: from the table, from the engine, and from this browser.
export async function removeFile(fileId) {
  const record = RECORDS.get(fileId);
  if (!record) return;
  RECORDS.delete(fileId);
  const handle = RESIDENT.get(fileId);
  if (handle) { dropFile(handle); RESIDENT.delete(fileId); }
  refile();
  await vault.remove(fileId);
  await refreshUsage();
}

/// Removes every import, from the table, the engine and this browser alike.
export async function clearImports() {
  RECORDS.clear();
  RESIDENT.clear();
  // Nothing to clear in a module that was never started, and asking would load it.
  if (engineLoaded()) clearFiles();
  refile();
  imported.storageError = null;
  await vault.clear();
  await refreshUsage();
}

/// The ids of every valid file behind a series, which is what a run resolves to
/// engine handles with `resident`.
export const fileIdsOf = (series) => series.files.filter((f) => f.status !== 'err').map((f) => f.id);

export const seriesFor = (assetKey) => imported.byAsset[assetKey] || [];
