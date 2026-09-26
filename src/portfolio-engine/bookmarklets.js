// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the
// user's disk from a site that only serves it to a page on that site. One bookmark per site works through
// every dataset the user added, one after another. Add a site here and its card in the download list gets
// an Assisted tab.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import { bookmarkletHref } from './bookmarklet.js';

// The indexes the NSE Indices page lists under Total Returns (Broad Market). Debt indices are not among them.
const NSE_SUPPORTED = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// First day of the financial year (April to March) that contains `d`.
export function yearStart(d) {
  return new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);
}

// The "start from" choices the settings box offers, with the dates they mean today. The bookmark itself
// works the date out when it is clicked, so "current" is always the financial year of the day it runs.
export function fromOptions(now = new Date()) {
  const cur = yearStart(now);
  const prev = new Date(cur.getFullYear() - 1, cur.getMonth(), 1);
  const fmt = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const fy = (d) => `FY ${d.getFullYear()}-${String((d.getFullYear() + 1) % 100).padStart(2, '0')}`;
  return [
    { id: 'CURRENT', label: 'Current FY', hint: `${fy(cur)}, from ${fmt(cur)}` },
    { id: 'PREVIOUS', label: 'Previous FY', hint: `from ${fmt(prev)}: ${fy(prev)} and the current FY` },
    { id: 'FULL', label: 'Full history', hint: "from each index's own start" },
    { id: 'DATE', label: 'Choose a date', hint: 'from a date you pick' },
  ];
}

// How many files one run makes for one index, given where it starts: one per financial year.
function files(indexStart, from, date, now = new Date()) {
  let start = new Date(indexStart);
  const cur = yearStart(now);
  const wanted = from === 'CURRENT' ? cur : from === 'PREVIOUS' ? new Date(cur.getFullYear() - 1, cur.getMonth(), 1) : from === 'DATE' && date ? new Date(date) : null;
  if (wanted && wanted > start) start = wanted;
  if (start > now) return 0;
  return yearStart(now).getFullYear() - yearStart(start).getFullYear() + 1;
}

const BUILDERS = {
  'NSE Indices': (items, { from = 'CURRENT', date = '' } = {}) => {
    const picked = items.filter((i) => i.kind === 'Index' && NSE_SUPPORTED.includes(i.asset) && i.inception);
    if (!picked.length) return null;
    const fromParam = from === 'DATE' ? date || iso(new Date()) : from;
    return {
      site: 'NSE Indices',
      openUrl: 'https://www.niftyindices.com/reports/historical-data',
      openLabel: 'Open NSE Indices',
      termsUrl: 'https://www.niftyindices.com/terms-of-use',
      label: 'Xfina · NSE Indices',
      // One bookmark, worked through in order: every index the user added.
      href: bookmarkletHref(nseIndices, { INDEXES: picked.map((i) => [i.asset.toUpperCase(), i.asset, i.inception]), FROM: fromParam }),
      indexes: picked.map((i) => i.asset),
      files: picked.reduce((n, i) => n + files(i.inception, from, date), 0),
      skipped: items.length - picked.length,
    };
  },
};

// The bookmark for the datasets in `items` that this site's bookmarklet can fetch, or null if there are none.
// `options`: from ('CURRENT' default, 'PREVIOUS', 'FULL' or 'DATE') and date (ISO, for 'DATE'). Files are always one per financial year.
export const bookmarkletFor = (site, items, options) => BUILDERS[site]?.(items, options) || null;
