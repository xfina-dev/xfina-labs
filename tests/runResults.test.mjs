// The results shaping, where it has to hold up on its own: which months carry
// an allocation to show, and what total drift comes to.
//
// Regression (xfina-labs): a run whose first contribution falls after its first
// year-end holds nothing until then. The engine returns a row of zeros for such
// a month, truthfully; read as an allocation it said every asset was its whole
// target below target while the total drift read 0% -- the row with nothing in
// it looked like the best-behaved row in the table.

import test from 'node:test';
import assert from 'node:assert/strict';
import { weightRows, driftRows, startYearOf, yearEnds } from '../src/portfolio-engine/runResults.js';

// A run of `months` months from 2009-01, holding nothing until `first`.
function run(months, first, targets) {
  const labels = Array.from({ length: months }, (_, m) => `${2009 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`);
  const weights = Array.from({ length: months }, (_, m) => (m < first ? targets.map(() => 0) : targets.slice()));
  const value = Array.from({ length: months }, (_, m) => (m < first ? 0 : 1_000_000));
  return [{ months, monthLabels: labels }, { weights, value }];
}

const TARGETS = [0.2, 0.1, 0.1, 0.05, 0.15, 0.4];

test('a year end before the first contribution carries no allocation row', () => {
  const [data, res] = run(36, 13, TARGETS); // nothing invested through 2009
  assert.deepEqual(yearEnds(data).map((m) => Number(data.monthLabels[m].slice(0, 4))), [2009, 2010, 2011]);

  const yearly = weightRows(data, res, 'Yearly');
  assert.deepEqual(yearly.map((r) => r.label), ['2010', '2011']);
  assert.equal(startYearOf(yearly, 2009), 2010);

  const monthly = weightRows(data, res, 'Monthly');
  assert.equal(monthly.length, 36 - 13);
  assert.equal(monthly[0].label, '2010-02');
  assert.equal(startYearOf(monthly, 2009), 2010);
  // Every row shown holds something.
  for (const r of [...yearly, ...monthly]) {
    assert.ok(r.w.reduce((a, w) => a + w, 0) > 0.999, `${r.label} holds nothing`);
  }
});

test('nothing held is never 0% drift', () => {
  // The row straight from the engine, as it would have been passed through.
  const nothing = driftRows([{ label: '2009', month: 11, w: TARGETS.map(() => 0) }], TARGETS);
  assert.deepEqual(nothing[0].drift, TARGETS.map((t) => -t));
  assert.equal(nothing[0].total, 0.5, 'a portfolio holding nothing is 50% drift by the half-sum, not 0%');
  assert.ok(nothing[0].total > 0, 'a row holding nothing must not read as no drift');
});

test('total drift is the sum of the overweights when the weights total 100%', () => {
  const targets = [0.5, 0.3, 0.2];
  const w = [0.56, 0.26, 0.18];
  const [row] = driftRows([{ label: '2012', month: 47, w }], targets);
  const over = row.drift.filter((d) => d > 0).reduce((a, d) => a + d, 0);
  assert.ok(Math.abs(row.total - over) < 1e-12, `${row.total} should equal the overweights ${over}`);
  assert.ok(Math.abs(row.total - 0.06) < 1e-12);
});

test('a run that never invests has no allocation to show at all', () => {
  const [data, res] = run(24, 24, TARGETS);
  assert.deepEqual(weightRows(data, res, 'Yearly'), []);
  assert.deepEqual(weightRows(data, res, 'Monthly'), []);
  assert.equal(startYearOf([], 2009), 2009);
});
