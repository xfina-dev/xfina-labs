// The invariant a stored result's charts depend on: they are drawn from the
// assets of the run that produced them, never from the current Select Assets
// picks.
//
// Regression (xfina-labs): DriftChart and AllocationChart indexed each row by
// the live `ASSETS` array from allocation.js. While the run's assets and the
// current picks agreed, that passed. Once imports persisted, a stored run could
// be viewed against a different selection -- after a reload, or simply by
// ticking an asset without running again. With fewer picks than the run had,
// a series went missing and the colours shifted; with more, every row was read
// past its end, and one `undefined` in `Math.max(...)` made the whole scale NaN,
// so the chart drew nothing at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seriesMismatch, finite } from '../src/portfolio-engine/chartSeries.js';

const CHARTS = ['DriftChart.vue', 'AllocationChart.vue'];
const source = (f) => readFileSync(new URL(`../src/portfolio-engine/${f}`, import.meta.url), 'utf8');

test('the per-asset charts take the run\'s assets and do not reach for the current picks', () => {
  for (const f of CHARTS) {
    const s = source(f);
    assert.doesNotMatch(s, /allocation\.js/, `${f} must not import the live ASSETS catalogue`);
    assert.doesNotMatch(s, /\bASSETS\b/, `${f} must not use ASSETS`);
    assert.match(s, /assets: \{ type: Array/, `${f} must take the run's assets as a prop`);
  }
});

test('a result charted against the wrong number of assets says so', () => {
  const four = [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }];
  // The run had one asset; the page is now showing four picks.
  const note = seriesMismatch([1, 1, 1], four);
  assert.match(note, /has 1 assets and the chart was given 4/);
  // And the other way round: four in the result, one picked now.
  assert.match(seriesMismatch([4, 4], [{ name: 'a' }]), /has 4 assets and the chart was given 1/);
  // Nothing passed at all is a mismatch too, not a blank chart.
  assert.notEqual(seriesMismatch([4], []), '');
});

test('rows that match the assets draw normally', () => {
  const three = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
  assert.equal(seriesMismatch([3, 3, 3, 3], three), '');
  assert.equal(seriesMismatch([], three), '', 'no rows is an empty chart, not a mismatch');
});

test('the scale is set by real numbers only', () => {
  assert.deepEqual(finite([0.1, undefined, -0.2, NaN, null, 0]), [0.1, -0.2, 0]);
  // What broke: one undefined reaching Math.max took every bound with it.
  assert.ok(Number.isNaN(Math.max(0.02, ...[0.1, undefined])));
  assert.equal(Math.max(0.02, ...finite([0.1, undefined])), 0.1);
});
