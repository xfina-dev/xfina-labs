// What identifies an asset.
//
// Three of the catalogue's assets share a name across regions -- Gold is an
// asset in India, the US and Global alike, and Short duration and Long duration
// are both India and US -- so a name is not an identity. An asset is identified
// by its region and its name together, `in:Gold`, from one helper.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assetId, regionCode, idOfKey, idOf } from '../src/portfolio-engine/identity.js';

const src = (f) => readFileSync(new URL(`../src/portfolio-engine/${f}`, import.meta.url), 'utf8');
const nodes = JSON.parse(src('tree.json')).nodes;

test('the three regions have the codes Sakthi asked for', () => {
  assert.equal(regionCode('india'), 'in');
  assert.equal(regionCode('us'), 'us');
  assert.equal(regionCode('global'), 'gl');
  // Either the catalogue's id or the tab's title, since the two sides of the
  // page hold different ones.
  assert.equal(regionCode('India'), 'in');
  assert.equal(regionCode('Global'), 'gl');
});

test('assets that share a name get different ids', () => {
  // The names that actually collide in the catalogue.
  const byName = new Map();
  for (const n of nodes) {
    byName.set(n.asset, (byName.get(n.asset) ?? new Set()).add(n.region));
  }
  const shared = [...byName].filter(([, regions]) => regions.size > 1).map(([asset]) => asset).sort();
  assert.deepEqual(shared, ['Gold', 'Long duration', 'Short duration'], 'the names that collide');

  // Each is its own asset once the region is in the identity.
  const ids = new Set();
  for (const n of nodes) ids.add(assetId(n.region, n.asset));
  assert.equal(ids.size, new Set(nodes.map((n) => `${n.region}|${n.asset}`)).size, 'no two assets share an id');
  assert.equal(assetId('india', 'Gold'), 'in:Gold');
  assert.notEqual(assetId('india', 'Gold'), assetId('us', 'Gold'));
  assert.notEqual(assetId('us', 'Gold'), assetId('global', 'Gold'));
  assert.notEqual(assetId('india', 'Short duration'), assetId('us', 'Short duration'));
});

test('the id comes from the catalogue key the imports are filed under', () => {
  assert.equal(idOfKey('india|debt|Short duration'), 'in:Short duration');
  assert.equal(idOfKey('global|gold|Gold'), 'gl:Gold');
});

test('a run saved before assets carried an id still identifies them', () => {
  // Old history holds only names, and must keep working: the name is the
  // fallback, so such a run behaves exactly as it did when it was saved.
  assert.equal(idOf({ id: 'in:Gold', name: 'India · Gold' }), 'in:Gold');
  assert.equal(idOf({ name: 'Gold' }), 'Gold');
  assert.equal(idOf(undefined), '');
});

test('nothing writes an identity out by hand', () => {
  // The way to get two identities that drift apart is to build the second one
  // somewhere else, which is what the matchAsset/haveIt divergence was. Every
  // site that needs one calls the helper.
  for (const f of ['store.js', 'ResultsSection.vue']) {
    assert.match(src(f), /from '\.\/identity\.js'/, `${f} must take the id from identity.js`);
  }
  // The region codes live in one place.
  for (const f of ['store.js', 'ResultsSection.vue', 'RebalancingSection.vue', 'PortfolioSection.vue', 'DriftChart.vue']) {
    assert.doesNotMatch(src(f), /['"]in:['"]|['"]gl:['"]/, `${f} must not spell a region code out`);
  }
});

test('the sites that used a name as identity now use the id', () => {
  // Bands belong to one asset: this is the one that changed what a run does.
  const reb = src('RebalancingSection.vue');
  assert.match(reb, /rangeOwn\[a\.id\]/);
  assert.doesNotMatch(reb, /rangeOwn\[a\.name\]/);
  // Hiding one asset's drift line leaves the others drawn.
  const results = src('ResultsSection.vue');
  assert.match(results, /driftHidden\.includes\(a\.id\)/);
  assert.doesNotMatch(results, /driftHidden\.includes\(a\.name\)/);
  assert.match(src('DriftChart.vue'), /props\.hidden\.includes\(a\.id \?\? a\.name\)/);
  // Two assets of one name are two CSV columns, not one heading twice.
  assert.match(results, /\$\{a\.id\}_pct/);
  assert.doesNotMatch(results, /\$\{a\.name\}_pct/);
  // And no `:key` over a run's assets is a name.
  assert.doesNotMatch(results, /in runAssets" :key="a\.name"/);
  assert.doesNotMatch(src('PortfolioSection.vue'), /in ASSETS" :key="a\.name"/);
  assert.doesNotMatch(reb, /in ASSETS" :key="a\.name"/);
});

test('two assets of one name make two distinct CSV headings', () => {
  const assets = [
    { id: assetId('india', 'Gold'), name: 'India · Gold' },
    { id: assetId('us', 'Gold'), name: 'US · Gold' },
    { id: assetId('global', 'Gold'), name: 'Global · Gold' },
  ];
  const headings = assets.map((a) => `${a.id}_pct`);
  assert.deepEqual(headings, ['in:Gold_pct', 'us:Gold_pct', 'gl:Gold_pct']);
  assert.equal(new Set(headings).size, 3);
});

test('hiding one asset leaves the others shown', () => {
  // The rule DriftChart applies, over three assets that share a name.
  const assets = ['india', 'us', 'global'].map((r) => ({ id: assetId(r, 'Gold'), name: 'Gold' }));
  const hidden = [assetId('india', 'Gold')];
  const shown = assets.map((a, k) => (hidden.includes(a.id ?? a.name) ? -1 : k)).filter((k) => k >= 0);
  assert.deepEqual(shown, [1, 2], 'only the India one is hidden');
  // By name, all three went at once.
  const byName = assets.map((a, k) => (['Gold'].includes(a.name) ? -1 : k)).filter((k) => k >= 0);
  assert.deepEqual(byName, [], 'which is what it used to do');
});
