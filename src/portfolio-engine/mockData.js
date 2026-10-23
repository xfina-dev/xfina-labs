// Illustrative numbers for the design mock. None of this is a real backtest.
import { reactive } from 'vue';

// The portfolio's assets, shared by every step: exactly the assets Select Assets uses (store.js keeps them in
// step), with the type of the series picked for each. The Allocation card edits weight, colour and order, and
// the results' legend and charts follow. Colours start in xfina-ui's slot order (chart-1, chart-2, …), the
// order its palette was checked in for colour-blind separation.
export const ASSETS = reactive([]); // [{ key, name, type, weight, color }]


export function allocation(n = 60, size = 1) {
  const target = ASSETS.map((a) => a.weight / 100);
  return Array.from({ length: n }, (_, i) => {
    // The same drift shape whatever the number of points (60 for a sketch, one per month for the results).
    const x = (i * 60) / n;
    const d = target.map((t, k) => Math.max(0.02, t + Math.sin(x / 6 + k * 1.7) * 0.04 * size * (k === 3 ? 2 : 1)));
    const z = d.reduce((a, b) => a + b, 0);
    return d.map((x) => x / z);
  });
}
