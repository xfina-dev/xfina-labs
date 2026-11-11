// Which asset an imported file is filed under.
//
// Regression (xfina-labs): AMFI's NAV export names the ICICI gilt fund
// "ICICI Prudential Gilt Fund - Growth", while the catalogue spells it
// "ICICI Prudential Gilt Fund - Regular Plan - Growth". The missing qualifier
// sits in the middle, so neither string contains the other and every pass that
// went by substring or by the asset's own name missed it: three files that read
// perfectly landed in "not matched to an asset" under a fund the catalogue
// lists.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogue, matchAsset, nameFit, norm } from '../src/portfolio-engine/matching.js';

const nodes = JSON.parse(readFileSync(new URL('../src/portfolio-engine/tree.json', import.meta.url), 'utf8')).nodes;
const CAT = catalogue(nodes);
// AMFI names a scheme the same way in `code` and `name`.
const amfi = (scheme) => matchAsset({ code: scheme, name: scheme, filename: `${scheme} NAV_x.xlsx` }, CAT);
const entry = (name) => CAT.instruments.find((i) => i.name === norm(name));

test('a scheme whose export omits the plan the catalogue spells out is still filed', () => {
  // The catalogue holds both plans of this fund, and only these two.
  const plans = CAT.instruments.filter((i) => i.words.has('gilt') && i.name.startsWith('icici'));
  assert.deepEqual(plans.map((i) => i.label).sort(), [
    'ICICI Prudential Gilt Fund - Direct Plan - Growth',
    'ICICI Prudential Gilt Fund - Regular Plan - Growth',
  ]);
  // Neither contains the file's own name, which is why the substring passes miss it.
  const file = norm('ICICI Prudential Gilt Fund - Growth');
  for (const i of plans) assert.ok(!i.name.includes(file) && !file.includes(i.name));
  // Both are the same asset, so the asset is certain even though the plan is not.
  assert.deepEqual([...new Set(plans.map((i) => i.assetKey))], ['india|debt|Long duration']);
  assert.deepEqual(amfi('ICICI Prudential Gilt Fund - Growth'), { assetKey: 'india|debt|Long duration', how: 'scheme name' });
});

test('Regular and Direct do not collide', () => {
  // Each full name is its own entry, matched exactly, and the two never swap.
  const regular = entry('ICICI Prudential Gilt Fund - Regular Plan - Growth');
  const direct = entry('ICICI Prudential Gilt Fund - Direct Plan - Growth');
  assert.ok(regular && direct);
  assert.notEqual(regular.label, direct.label);
  for (const label of [regular.label, direct.label]) {
    const m = amfi(label);
    assert.equal(m.assetKey, 'india|debt|Long duration');
    assert.equal(m.how, 'name');
  }
  // A match names an asset, never an instrument: that is why two plans of one
  // fund can both stand without the run reading the wrong NAVs. The values come
  // from the file.
  assert.deepEqual(Object.keys(amfi('ICICI Prudential Gilt Fund - Growth')).sort(), ['assetKey', 'how']);
});

test('entries that do not agree on an asset leave the file unmatched, and say which', () => {
  // A made-up catalogue: one name is a word-subset of two entries in different
  // assets, so there is nothing to pick between.
  const cat = catalogue([
    { region: 'india', class: 'equity', asset: 'Alpha', vehicle: 'mf', instruments: [{ name: 'Acme Fund - Regular Plan - Growth' }] },
    { region: 'india', class: 'debt', asset: 'Beta', vehicle: 'mf', instruments: [{ name: 'Acme Fund - Direct Plan - Growth' }] },
  ]);
  const m = matchAsset({ code: 'Acme Fund - Growth', name: 'Acme Fund - Growth' }, cat);
  assert.equal(m.assetKey, undefined, 'must not pick one of two assets');
  assert.deepEqual(m.ambiguous.sort(), ['Acme Fund - Direct Plan - Growth', 'Acme Fund - Regular Plan - Growth']);
  assert.equal(m.assets.length, 2);
});

test('an early disagreement does not stop a later pass that is sure', () => {
  // "Gold" matches instruments across India, the US and Global -- and is also
  // the India gold asset's own name. The asset-name pass must still win.
  const m = matchAsset({ code: 'Gold', name: 'Gold', filename: 'Gold.csv' }, CAT);
  assert.equal(m.how, 'index name');
  assert.equal(m.assetKey, 'india|gold|Gold');
});

test('the index files still match the way they did', () => {
  for (const [code, key] of [
    ['NIFTY 50', 'india|equity|Nifty 50'],
    ['NIFTY NEXT 50', 'india|equity|Nifty Next 50'],
    ['NIFTY MIDCAP 150', 'india|equity|Nifty Midcap 150'],
    ['NIFTY SMALLCAP 250', 'india|equity|Nifty Smallcap 250'],
  ]) {
    const m = matchAsset({ code, name: null, filename: `${code}_Historical_TR_01042026to10112026.csv` }, CAT);
    assert.equal(m.assetKey, key, code);
  }
});

test('the other AMFI schemes in the sample folder are unaffected', () => {
  for (const [scheme, key] of [
    ['ICICI Prudential Nifty 50 Index Fund - Cumulative Option', 'india|equity|Nifty 50'],
    ['Nippon India Gold Savings Fund-Growth plan- Growth Option', 'india|gold|Gold'],
    ['Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option', 'india|equity|Nifty 50'],
    ['Quantum Gold ETF FOF - Direct Plan Growth Option', 'india|gold|Gold'],
    ['UTI Liquid Fund - Regular Plan - Growth Option', 'india|debt|Short duration'],
  ]) {
    assert.equal(amfi(scheme).assetKey, key, scheme);
  }
});

test('a file naming nothing the catalogue lists is still unmatched', () => {
  assert.equal(matchAsset({ code: 'ZZZ Imaginary Index', name: null, filename: 'zzz.csv' }, CAT), null);
});

// Regression (xfina-labs): the "To download" badge in Select Assets kept its own
// copy of the name comparison, so after the matcher learned AMFI's shortened
// scheme names the badge went on claiming the gilt files had not arrived. The
// rule now has one home, and these pin what it answers for that row.
test('a scheme the catalogue spells out more fully still counts as held', () => {
  const file = 'ICICI Prudential Gilt Fund - Growth';
  assert.equal(nameFit(file, 'ICICI Prudential Gilt Fund - Regular Plan - Growth'), 'scheme');
  assert.equal(nameFit(file, 'ICICI Prudential Gilt Fund - Direct Plan - Growth'), 'scheme');
  // A different fund of the same kind is not it, however much wording they share.
  assert.equal(nameFit(file, 'Kotak Gilt Fund - Regular Plan - Growth'), null);
  assert.equal(nameFit(file, 'HDFC Gilt Fund - Regular Plan - Growth Option'), null);
});

test('a name that spells out more around the entry is exact, not a guess', () => {
  // The file carries the plan: one entry can be it, and only one.
  assert.equal(nameFit('UTI Liquid Fund - Regular Plan - Growth Option', 'UTI - Liquid Fund - Regular Plan - Growth'), 'exact');
  // The index's own name sits inside the TRI entry's, so a substring settles it.
  assert.equal(nameFit('NIFTY 50', 'Nifty 50 TRI'), 'exact');
  assert.equal(nameFit('', 'Anything'), null);
  assert.equal(nameFit('Anything', ''), null);
});

test("'scheme' is the fit that cannot tell two plans apart, and says so by its name", () => {
  // Both plans of one fund answer the same way, which is why the caller must
  // settle it some other way (the inception date, or by leaving it unclaimed)
  // rather than taking the first.
  const plans = ['ICICI Prudential Gilt Fund - Regular Plan - Growth', 'ICICI Prudential Gilt Fund - Direct Plan - Growth'];
  const fits = plans.map((p) => nameFit('ICICI Prudential Gilt Fund - Growth', p));
  assert.deepEqual(fits, ['scheme', 'scheme']);
  // The catalogue's own inception dates are what separates them: the Direct
  // plan did not exist when the Regular plan's history starts.
  const [regular, direct] = plans.map((p) => CAT.instruments.find((i) => i.name === norm(p)));
  assert.ok(regular && direct);
  const inception = (label) => nodes.flatMap((n) => n.instruments).find((i) => i.name === label).inception;
  assert.ok(inception(plans[0]) < inception(plans[1]), 'Regular predates Direct');
  assert.ok('2006-04-02' < inception(plans[1]), 'a 2006 series cannot be the Direct plan');
});
