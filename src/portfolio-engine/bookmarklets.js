// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the
// user's disk from a site that only serves it to a page on that site. One bookmark per site works through
// every dataset the user added, one after another. Add a site here and its card in the download list gets
// an Assisted tab.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import { bookmarkletHref } from './bookmarklet.js';

// The indexes the NSE Indices page lists under Total Returns (Broad Market). Debt indices are not among them.
const NSE_SUPPORTED = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// First day of the financial year (April to March) that contains `d`.
export function yearStart(d) {
  return new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);
}

// The period choices the settings box offers. The bookmark itself works the dates out when it is clicked, so
// "current" is always the financial year of the day it runs.
export const PERIODS = [
  { id: 'CURRENT', label: 'Current FY', hint: 'the current financial year so far' },
  { id: 'PREVIOUS', label: 'Previous FY', hint: 'the previous financial year and the current one so far' },
  { id: 'FULL', label: 'Full history', hint: 'every index from its own start (the earliest start is shown)' },
  { id: 'CUSTOM', label: 'Custom', hint: 'the dates you pick' },
];

// The dates a period means today, for showing in the settings box. `start` is null for the full history,
// which begins at a different date for each index (the card shows the earliest of them).
export function periodDates(from, now = new Date()) {
  const cur = yearStart(now);
  if (from === 'CURRENT') return { start: iso(cur), end: iso(now) };
  if (from === 'PREVIOUS') return { start: iso(new Date(cur.getFullYear() - 1, cur.getMonth(), 1)), end: iso(now) };
  return { start: null, end: iso(now) };
}

// The dates a run covers for one index, or null if the period is empty: from where it starts (never before the
// index itself) to where it ends (never after today).
function span(indexStart, { from, start, end }, now = new Date()) {
  const cur = yearStart(now);
  const wanted = from === 'CURRENT' ? cur : from === 'PREVIOUS' ? new Date(cur.getFullYear() - 1, cur.getMonth(), 1) : from === 'CUSTOM' && start ? parseIso(start) : null;
  let s0 = parseIso(indexStart);
  if (wanted && wanted > s0) s0 = wanted;
  let e0 = from === 'CUSTOM' && end ? parseIso(end) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (e0 > now) e0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return s0 <= e0 ? [s0, e0] : null;
}

// The files one run makes for one index: one per financial year in the period, cut at the period's ends. Same
// rule as the bookmark script. A file is a full year when it covers 1 April to 31 March.
function fileWindows(indexStart, period) {
  const r = span(indexStart, period);
  if (!r) return [];
  const out = [];
  let cursor = r[0];
  while (cursor <= r[1]) {
    const y = cursor.getFullYear();
    let end = new Date(cursor.getMonth() >= 3 ? y + 1 : y, 2, 31);
    if (end > r[1]) end = r[1];
    const full = cursor.getMonth() === 3 && cursor.getDate() === 1 && end.getMonth() === 2 && end.getDate() === 31;
    out.push({ start: cursor, end, full });
    cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  }
  return out;
}

// One row of the Files table for one index.
function fileRow(name, indexStart, period) {
  const w = fileWindows(indexStart, period);
  return {
    index: name,
    files: w.length,
    start: w.length ? iso(w[0].start) : '',
    end: w.length ? iso(w.at(-1).end) : '',
    fullYears: w.filter((x) => x.full).length,
    partialYears: w.filter((x) => !x.full).length,
  };
}

const BUILDERS = {
  'NSE Indices': (items, { from = 'CURRENT', start = '', end = '' } = {}) => {
    const picked = items.filter((i) => i.kind === 'Index' && NSE_SUPPORTED.includes(i.asset) && i.inception);
    if (!picked.length) return null;
    // A custom period needs both dates, and the end can't come before the start.
    const invalid = from === 'CUSTOM' && (!start || !end ? 'Choose a start and an end date.' : end < start ? 'The end date is before the start date.' : '');
    const period = { from, start, end };
    return {
      site: 'NSE Indices',
      openUrl: 'https://www.niftyindices.com/reports/historical-data',
      openLabel: 'Open NSE Indices',
      termsUrl: 'https://www.niftyindices.com/terms-of-use',
      label: 'Xfina · NSE Indices',
      // One bookmark, worked through in order: every index the user added.
      invalid,
      href: invalid ? null : bookmarkletHref(nseIndices, { INDEXES: picked.map((i) => [i.asset.toUpperCase(), i.asset, i.inception]), FROM: from === 'CUSTOM' ? start : from, TO: from === 'CUSTOM' ? end : '' }),
      indexes: picked.map((i) => i.asset),
      // The earliest start among the picked indexes: what Full history shows as its start date.
      earliest: picked.map((i) => i.inception).sort()[0],
      rows: invalid ? [] : picked.map((i) => fileRow(i.asset, i.inception, period)),
      files: invalid ? 0 : picked.reduce((n, i) => n + fileWindows(i.inception, period).length, 0),
      skipped: items.length - picked.length,
    };
  },
};

// The bookmark for the datasets in `items` that this site's bookmarklet can fetch, or null if there are none.
// `options`: from ('CURRENT' default, 'PREVIOUS', 'FULL' or 'CUSTOM') and, for 'CUSTOM', start and end (ISO dates). Files are always one per financial year.
export const bookmarkletFor = (site, items, options) => BUILDERS[site]?.(items, options) || null;
