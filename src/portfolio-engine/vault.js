// Where imported files live between visits: this browser, and nowhere else.
//
// Two stores, kept apart on purpose:
//
// - `imports` holds what the page shows about a file -- its name, the publisher
//   whose format it turned out to be, the dates and rows it covers, its checks.
//   Small, and enough to draw the whole Select Assets table.
// - `blobs` holds the file exactly as it was imported, byte for byte.
//
// The split is what lets a reload render the import table and the run history
// without loading the engine at all: the metadata is read from here and drawn,
// and a file's bytes only go into the WASM module when something actually needs
// its parsed series -- a run, or a CSV. The module is a megabyte; a reload
// should not pay for it to show a table.
//
// IndexedDB is per-origin and local. Nothing here is uploaded, and nothing here
// leaves the browser.

const DB = 'xfina_labs_portfolio_engine';
const VERSION = 1;
export const IMPORTS = 'imports';
export const BLOBS = 'blobs';

let opening = null;

/// Opens the database, creating the stores on first use. Resolves to null where
/// IndexedDB is not available at all (a locked-down private window), so every
/// caller degrades to "this visit only" rather than failing.
function open() {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB, VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMPORTS)) db.createObjectStore(IMPORTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return opening;
}

function run(db, stores, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let out;
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    out = work(tx);
  });
}

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/// A file's identity is its content: the same bytes imported twice are the same
/// file, whatever it was called the second time, and a corrected re-download is
/// a different one. SHA-256 of the bytes, which is what `crypto.subtle` gives
/// on every browser this runs in.
export async function fileId(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/// Every import's metadata, oldest first. Reads one store and touches no bytes,
/// so a reload can draw the table before the engine exists.
export async function allImports() {
  const db = await open();
  if (!db) return [];
  try {
    const rows = await run(db, [IMPORTS], 'readonly', (tx) => request(tx.objectStore(IMPORTS).getAll()));
    return (rows || []).sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
  } catch {
    return [];
  }
}

/// Whether a file is already in, without reading its bytes.
export async function has(id) {
  const db = await open();
  if (!db) return false;
  try {
    const key = await run(db, [IMPORTS], 'readonly', (tx) => request(tx.objectStore(IMPORTS).getKey(id)));
    return key !== undefined;
  } catch {
    return false;
  }
}

/// One file's bytes, or null when they are gone (a cleared store, an eviction).
export async function bytesOf(id) {
  const db = await open();
  if (!db) return null;
  try {
    const row = await run(db, [BLOBS], 'readonly', (tx) => request(tx.objectStore(BLOBS).get(id)));
    return row ? new Uint8Array(row.bytes) : null;
  } catch {
    return null;
  }
}

/// A browser out of room is not a reason to lose what is already stored, so a
/// failed write is reported rather than thrown, and the caller tells the user.
export class StorageFull extends Error {}

/// Saves one import: its metadata and its bytes, in one transaction, so the
/// table can never list a file whose bytes are missing.
export async function put(record, bytes) {
  const db = await open();
  if (!db) return false;
  try {
    await run(db, [IMPORTS, BLOBS], 'readwrite', (tx) => {
      tx.objectStore(IMPORTS).put(record);
      // A copy, not the caller's view: the array it holds may be reused.
      tx.objectStore(BLOBS).put({ id: record.id, bytes: bytes.slice().buffer });
    });
    return true;
  } catch (e) {
    if (e?.name === 'QuotaExceededError') throw new StorageFull(e.message);
    throw e;
  }
}

/// Updates one import's metadata, leaving its bytes alone. Used when a newer
/// parser reads a file differently from the version that first read it.
export async function patch(record) {
  const db = await open();
  if (!db) return false;
  try {
    await run(db, [IMPORTS], 'readwrite', (tx) => tx.objectStore(IMPORTS).put(record));
    return true;
  } catch {
    return false;
  }
}

/// Removing a file removes both halves of it. A metadata row without its bytes
/// is a file the page would list and could never run.
export async function remove(id) {
  const db = await open();
  if (!db) return false;
  try {
    await run(db, [IMPORTS, BLOBS], 'readwrite', (tx) => {
      tx.objectStore(IMPORTS).delete(id);
      tx.objectStore(BLOBS).delete(id);
    });
    return true;
  } catch {
    return false;
  }
}

/// Forgets every import.
export async function clear() {
  const db = await open();
  if (!db) return false;
  try {
    await run(db, [IMPORTS, BLOBS], 'readwrite', (tx) => {
      tx.objectStore(IMPORTS).clear();
      tx.objectStore(BLOBS).clear();
    });
    return true;
  } catch {
    return false;
  }
}

/// How much room the imports take and how much this browser allows, for the
/// line under the table. Both are the browser's own estimate, and it rounds.
export async function usage() {
  const rows = await allImports();
  const stored = rows.reduce((n, r) => n + (r.size || 0), 0);
  let quota = null;
  let used = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    quota = estimate?.quota ?? null;
    used = estimate?.usage ?? null;
  } catch { /* the browser will not say; the file total still will */ }
  return { files: rows.length, stored, used, quota };
}

/// Whether the browser has promised not to evict this origin's data under
/// pressure. Asked once, never forced: a refusal only means the data is
/// evictable, which the page says plainly rather than pretending otherwise.
export async function persist() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
