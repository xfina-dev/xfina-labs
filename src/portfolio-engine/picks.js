// What was chosen in Choose: a catalogue instrument, and the source to get it
// from.
//
// These used to live in `localStorage['xfina_labs_guide_selection_v4']` while
// the files lived in IndexedDB, with no key in common -- which is why the app
// reconciled the two by comparing names as it drew, and why a week of bugs came
// out of that. The names are long gone (a file records its catalogue instrument
// when it arrives), and this folds the picks into the same store as the files,
// so everything about a dataset is in one place keyed by one id.
//
// The old key is read once and then left exactly where it is. Rewriting it is
// not worth the risk: it is a few hundred bytes, and a browser that goes back
// to an earlier deploy still finds its picks there.
import { reactive } from 'vue';
import * as vault from './vault.js';
import { findDataset } from './guide.js';

const OLD_KEY = 'xfina_labs_guide_selection_v4';
// Set once the old key has been read, so a second visit does not read it again
// -- otherwise removing a pick here would be undone by the old copy next load.
const DONE_KEY = 'xfina_labs_guide_picks_migrated';

/// `id → how`, the shape every caller already expected.
export const picks = reactive({ by: {}, loaded: false });

const marked = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; } };
const mark = () => { try { localStorage.setItem(DONE_KEY, '1'); } catch { /* this visit only */ } };

// A pick names a catalogue instrument, and the catalogue moves: ids are
// resolved differently as aliases are added and entries change. One that names
// nothing is dropped quietly -- it cannot be shown, and materialising a row for
// an instrument that is not there would be worse than forgetting it.
const known = (entries) => entries.filter(([id]) => !!findDataset(id));

function fromOldKey() {
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? Object.entries(parsed) : [];
  } catch {
    return []; // unreadable or not JSON: nothing to carry over
  }
}

/// Reads what is chosen, bringing the old key's contents over the first time.
///
/// Nothing here writes to `imports` or `blobs`, so a failure anywhere in it
/// leaves the files and the run history exactly as they were; the picks are
/// then simply unmigrated, and the next load tries again.
export async function load() {
  let rows = [];
  try {
    rows = await vault.allPicks();
  } catch {
    rows = [];
  }
  let entries = known(rows.map((r) => [r.id, r.how]));
  if (!rows.length && !marked()) {
    const carried = known(fromOldKey());
    if (carried.length) {
      entries = carried;
      try {
        await vault.putPicks(carried.map(([id, how]) => ({ id, how })));
        mark();
      } catch {
        // Unwritable: the picks hold for this visit and the old key is still
        // there, so the next load carries them over again.
      }
    } else {
      // Nothing to carry, so there is nothing to do again later either.
      mark();
    }
  }
  picks.by = Object.fromEntries(entries);
  picks.loaded = true;
  return picks.by;
}

/// Replaces what is chosen. Writing through on every change, because a pick the
/// user made and lost would be worse than a slow save.
export async function save(next) {
  picks.by = { ...next };
  mark();
  try {
    await vault.putPicks(Object.entries(picks.by).map(([id, how]) => ({ id, how })));
  } catch {
    // Same as above: this visit only, and the page says nothing it cannot back up.
  }
}
