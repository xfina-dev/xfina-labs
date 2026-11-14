// Which sources have a bookmarklet, and therefore show no "Get".
//
// A site that only serves its data to a page on its own site has no link to
// hand over: the bookmark in How to get data is how the file arrives, so a
// "Get" pointing at a download section sends the user looking for something
// that is not there. Select Assets asks `hasBookmarklet(how)` for that, and the
// answer is derived from the builders rather than listed, so this checks the
// derivation itself: a bookmarklet added or removed must move these answers
// without anyone editing a list.
//
// bookmarklets.js cannot be imported in Node (it reads the scripts through
// Vite's `?raw`), so the derivation is reproduced here from the same two
// sources it uses -- the builder keys and HOW's site names -- and the test
// fails if either side stops lining up.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../src/portfolio-engine/${f}`, import.meta.url), 'utf8');
const bookmarklets = read('bookmarklets.js');
const guide = read('guide.js');

// The sites BUILDERS holds a builder for.
const builderSites = (() => {
  const body = bookmarklets.slice(bookmarklets.indexOf('const BUILDERS = {'));
  return [...body.matchAll(/^ {2}'?([A-Za-z][A-Za-z ]*?)'?: \(items\) =>/gm)].map((m) => m[1]);
})();
// Every `how` in HOW, with the site it names.
const hows = (() => {
  const body = guide.slice(guide.indexOf('export const HOW = {'));
  return [...body.matchAll(/^ {2}(\w+): \{\n {4}site: '([^']+)'/gm)].map((m) => ({ how: m[1], site: m[2] }));
})();
const hasBookmarklet = (how) => builderSites.includes(hows.find((h) => h.how === how)?.site);

test('the two sides line up, so the derivation means something', () => {
  assert.ok(builderSites.length >= 5, `found ${builderSites.length} builders`);
  assert.ok(hows.length >= 10, `found ${hows.length} sources`);
  // Every builder's site is a site some source names: a builder keyed to a site
  // nothing uses would make hasBookmarklet silently false everywhere.
  for (const site of builderSites) {
    assert.ok(hows.some((h) => h.site === site), `no source names the site ${site}`);
  }
});

test('a bookmarklet-driven source shows no Get', () => {
  // The rows Sakthi was looking at: AMFI funds and NSE Indices debt series.
  for (const how of ['amfi', 'nseTri', 'nseEtf', 'mcxSpot']) {
    assert.equal(hasBookmarklet(how), true, how);
  }
  // Beyond the four, by the same principle rather than by a list.
  for (const how of ['tiingo', 'wsj']) {
    assert.equal(hasBookmarklet(how), true, `${how} has a bookmarklet too`);
  }
});

test('a manual-download source still shows Get', () => {
  for (const how of ['ishares', 'msci', 'yahoo', 'nasdaqIndex', 'spdrgold']) {
    assert.equal(hasBookmarklet(how), false, how);
  }
});

test('an unknown source is treated as a manual download', () => {
  // A dataset with no `how`, or one naming a source that has gone: show the
  // link rather than hiding the only way on.
  assert.equal(hasBookmarklet(undefined), false);
  assert.equal(hasBookmarklet('nothing-like-this'), false);
});

test('the pages ask for it rather than keeping their own list', () => {
  // The Get phase offers a site's bookmark where it has one and its download
  // page otherwise, from the builders themselves -- no site names written into
  // a page, so adding or dropping a bookmarklet needs no edit here.
  const get = read('ChooseAndGet.vue');
  assert.match(get, /import \{ bookmarkletFor \} from '\.\/bookmarklets\.js'/);
  assert.match(get, /bookmarklet: bookmarkletFor\(site, its\)/, 'a card takes its bookmark from the builder');
  assert.match(get, /v-if="g\.bookmarklet"/, 'and offers it only where there is one');
  // It does name the sites in one place -- SITE_ORDER, which is the order the
  // download cards appear in. That is presentation, not a decision about where
  // data comes from, and a site missing from it still gets a card.
  assert.match(get, /const SITE_ORDER = \[/);
  assert.doesNotMatch(get, /hasBookmarklet/, 'the Get phase asks the builder, not a list of sites');
  // The step that picks a series for a run holds none of this any more.
  const section = read('DataSection.vue');
  assert.doesNotMatch(section, /hasBookmarklet|guide_selection/, 'the Series step does not manage data');
  assert.doesNotMatch(section, /get-data\/#download/, 'nor link at the old page');
});
