// Folding the picks in beside the files, and what must survive it.
//
// Sakthi's browser holds 97 imported files and real run history under formats
// that predate this change, and it cannot be reached from here. So the things
// that would lose that data are checked against the source directly, and the
// behaviour was exercised in a browser against those same 97 files.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../src/portfolio-engine/${f}`, import.meta.url), 'utf8');
// Comments explain what the code must not do, so an assertion about the code
// has to read past them.
const code = (text) => text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const picks = read('picks.js');
const vault = read('vault.js');
const nodes = JSON.parse(read('tree.json')).nodes;

test('the upgrade only ever adds a store', () => {
  // An upgrade that dropped or recreated a store would take the files with it.
  // Every store is created only when absent, and nothing is deleted anywhere.
  const creates = [...vault.matchAll(/if \(!db\.objectStoreNames\.contains\((\w+)\)\) db\.createObjectStore\(/g)].map((m) => m[1]);
  assert.deepEqual(creates.sort(), ['BLOBS', 'IMPORTS', 'PICKS'], 'each store is guarded');
  assert.doesNotMatch(vault, /deleteObjectStore|deleteDatabase/, 'nothing deletes a store or the database');
  assert.match(vault, /const VERSION = 2;/);
});

test('migrating the picks cannot touch the files or the history', () => {
  // The whole risk in this change: it writes to one store and reads one key.
  assert.doesNotMatch(code(picks), /IMPORTS|BLOBS|imports|blobs/, 'picks.js must not name the file stores');
  assert.doesNotMatch(code(picks), /history/, 'nor the run history');
  // Which also answers "a browser with picks but no imports": nothing in this
  // path looks at imports at all, so their absence changes nothing.
  for (const fn of ['allPicks', 'putPicks']) assert.match(picks, new RegExp(`vault\\.${fn}`));
  assert.match(vault, /export async function putPicks[\s\S]*?run\(db, \[PICKS\], 'readwrite'/, 'and writes only that store');
});

test('the old key is read, never written and never removed', () => {
  assert.match(picks, /localStorage\.getItem\(OLD_KEY\)/);
  assert.doesNotMatch(picks, /setItem\(OLD_KEY|removeItem\(OLD_KEY/, 'the old key stays exactly as it was');
});

test('it runs once, so a removed pick is not resurrected', () => {
  // The old key still lists everything it ever listed, so reading it on every
  // load would undo a removal. A marker says it has been read.
  assert.match(picks, /const DONE_KEY = /);
  assert.match(picks, /if \(!rows\.length && !marked\(\)\)/, 'only when there is nothing stored and it has not run');
  assert.match(picks, /mark\(\);/);
});

test('a pick naming a dataset the catalogue no longer has is dropped', () => {
  assert.match(picks, /const known = \(entries\) => entries\.filter\(\(\[id\]\) => !!findDataset\(id\)\)/);
  // The ids used when this was exercised in the browser: two real, one gone.
  const ids = new Set(nodes.flatMap((n) => n.instruments.map((i) => i.id)));
  assert.ok(ids.has('idx-nifty-50-tri'));
  assert.ok(ids.has('idx-nifty-10-yr-benchmark-g-sec-index'));
  assert.ok(!ids.has('mf-this-id-was-removed'));
});

test('nothing reads the picks out of localStorage any more', () => {
  for (const f of ['ChooseAndGet.vue', 'DataSection.vue', 'Datasets.vue']) {
    assert.doesNotMatch(read(f), /guide_selection_v4/, `${f} must take the picks from picks.js`);
  }
  assert.match(read('ChooseAndGet.vue'), /from '\.\/picks\.js'/);
});
