// The investment plan: a lumpsum, then each month a share of take-home pay. The salary (before tax) and the
// savings rate (a share of what's left after tax) each move from a starting value to an ending one over the
// contribution years, along a chosen curve; income tax takes an effective share of the salary. Salary and rate
// change once a year (a raise, a new savings habit), not every month, so each contribution year has one salary
// and one monthly investment: salary × (1 − tax) × savings rate.

// How a value travels from its start to its end. Compound grows by the same percentage each year (the salary's
// natural curve); Linear by the same amount; Fast early covers most of the way in the first years; Fast late in
// the last; S-curve starts slow, speeds up mid-way, and settles.
export const CURVES = ['Compound', 'Linear', 'Fast early', 'Fast late', 'S-curve'];
const SHAPES = { Linear: (x) => x, 'Fast early': (x) => 1 - (1 - x) ** 2, 'Fast late': (x) => x * x, 'S-curve': (x) => x * x * (3 - 2 * x) };
export function along(curve, a, b, x) {
  if (curve === 'Compound') return a > 0 && b > 0 ? a * (b / a) ** x : a + (b - a) * x;
  return a + (b - a) * (SHAPES[curve] ?? SHAPES.Linear)(x);
}

// The defaults, which the mock's results are built on.
export const DEFAULT_PLAN = {
  lumpsum: 1_000_000,
  salaryPer: 'year', // salaries are entered a year at a time (plans saved before this were a month at a time)
  salaryStart: 1_500_000, // a year, before tax
  salaryBy: 'Growth', // the salary's end is set by a yearly growth rate, or given as an ending salary
  salaryGrowth: 10, // % a year
  salaryEnd: 9_000_000,
  salaryCurve: 'Compound',
  taxRate: 20, // income tax, an effective % of salary: assumed flat for now; the engine will compute it
  rateStart: 30, // % of take-home (salary after tax) saved and invested
  rateEnd: 50,
  rateCurve: 'S-curve',
  investDay: 'First working day',
  startMonth: '2007-01',
  endMonth: '2026-09',
};

// Months from one 'YYYY-MM' to another, both included; and the contribution years they span.
export const monthsBetween = (from, to) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
export const planYears = (p) => Math.max(1, Math.ceil(monthsBetween(p.startMonth, p.endMonth) / 12));

// The salary's end and its yearly growth: one is entered, the other follows from it over the contribution years.
// Salaries are entered a year at a time; a row's salary is the month's (a twelfth of the year's).
export function salarySpan(p) {
  const steps = planYears(p) - 1, start = Number(p.salaryStart) || 0;
  if (p.salaryBy === 'Ending') {
    const end = Number(p.salaryEnd) || 0;
    return { end, growth: steps && start > 0 && end > 0 ? (end / start) ** (1 / steps) - 1 : 0 };
  }
  const growth = (Number(p.salaryGrowth) || 0) / 100;
  return { end: start * (1 + growth) ** steps, growth };
}

// One row per contribution year: its first month, the year's salary, the month's salary and the tax on it, the
// savings rate, the monthly investment, and what's left to spend each month.
export function planRows(p) {
  const years = planYears(p), { end } = salarySpan(p);
  const y0 = Number(p.startMonth.slice(0, 4)), m0 = Number(p.startMonth.slice(5, 7));
  return Array.from({ length: years }, (_, y) => {
    const x = years > 1 ? y / (years - 1) : 0;
    const salaryYear = along(p.salaryCurve, Number(p.salaryStart) || 0, end, x), salary = salaryYear / 12;
    const rate = along(p.rateCurve, Number(p.rateStart) || 0, Number(p.rateEnd) || 0, x) / 100;
    const first = (m0 - 1 + 12 * y);
    const tax = salary * Math.min(1, Math.max(0, (Number(p.taxRate) || 0) / 100)), monthly = (salary - tax) * rate;
    return { year: y, from: `${y0 + Math.floor(first / 12)}-${String((first % 12) + 1).padStart(2, '0')}`, salaryYear, salary, tax, rate, monthly, spent: salary - tax - monthly };
  });
}

// What goes in k months after the contribution start: the lumpsum with the first instalment, then that year's
// monthly investment, until the contribution end.
export function contributionAt(p, k, rows = planRows(p)) {
  if (k < 0 || k >= monthsBetween(p.startMonth, p.endMonth)) return 0;
  return (k === 0 ? Number(p.lumpsum) || 0 : 0) + rows[Math.floor(k / 12)].monthly;
}
