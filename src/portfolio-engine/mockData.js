// Illustrative numbers for the design mock. None of this is a real backtest.
export const ASSETS = [
  { name: 'Nifty 50', series: 'Nifty 50 TRI', kind: 'benchmark', weight: 20, color: 'chart-1' },
  { name: 'Nifty Next 50', series: 'Nifty Next 50 TRI', kind: 'benchmark', weight: 10, color: 'chart-4' },
  { name: 'Nifty Midcap 150', series: 'Nifty Midcap 150 TRI', kind: 'benchmark', weight: 10, color: 'chart-5' },
  { name: 'Nasdaq 100', series: 'Irish UCITS ETF', kind: 'proxy', weight: 40, color: 'chart-2' },
  { name: 'Gold', series: 'Gold ETF (INR)', kind: 'proxy', weight: 10, color: 'chart-3' },
  { name: 'India debt — short', series: 'Liquid fund', kind: 'proxy', weight: 10, color: 'chart-1' },
];

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 200;
const r = rng(7);
export const value = [], invested = [], drawdown = [];
{
  let v = 10, inv = 10, peak = 10;
  for (let i = 0; i < N; i++) {
    const ret = 0.0095 + (r() - 0.5) * 0.05 - (i > 122 && i < 128 ? 0.05 : 0);
    v = (v + (i ? 0.64 : 0)) * (1 + ret);
    inv += i ? 0.64 : 0;
    peak = Math.max(peak, v);
    value.push(v); invested.push(inv); drawdown.push(v / peak - 1);
  }
  const k = 284 / value[N - 1]; // chart ends at the KPI value
  value.forEach((x, i) => (value[i] = x * k));
}
export const rebalanceAt = [30, 58, 84, 118, 152, 181];

export function allocation(n = 60) {
  const target = ASSETS.map((a) => a.weight / 100);
  return Array.from({ length: n }, (_, i) => {
    const d = target.map((t, k) => Math.max(0.02, t + Math.sin(i / 6 + k * 1.7) * 0.04 * (k === 3 ? 2 : 1)));
    const z = d.reduce((a, b) => a + b, 0);
    return d.map((x) => x / z);
  });
}
