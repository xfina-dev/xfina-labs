// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the
// user's disk from a site that only serves it to a page on that site. A bookmark is generated per dataset
// the user added, so each tab shows the progress of one. Add a site here and its card in the download
// list gets draggable buttons.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import { bookmarkletHref } from './bookmarklet.js';

// How many one-year files a run makes: financial years (April to March) or calendar years from the start
// date to today, the first and last usually partial.
function periods(startIso, split) {
  const start = new Date(startIso);
  const now = new Date();
  const firstYear = split === 'FY' && start.getMonth() < 3 ? start.getFullYear() - 1 : start.getFullYear();
  const lastYear = split === 'FY' && now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return lastYear - firstYear + 1;
}

// The indexes the NSE Indices page lists under Total Returns (Broad Market). Debt indices are not among them.
const NSE_SUPPORTED = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

const BUILDERS = {
  'NSE Indices': (items, { split = 'FY' } = {}) => {
    const picked = items.filter((i) => i.kind === 'Index' && NSE_SUPPORTED.includes(i.asset) && i.inception);
    if (!picked.length) return null;
    return {
      openUrl: 'https://www.niftyindices.com/reports/historical-data',
      openLabel: 'Open NSE Indices',
      // One bookmark per index: open the page in one tab per index and run each bookmark in its own tab.
      bookmarks: picked.map((i) => ({
        label: `Xfina · ${i.asset}`,
        href: bookmarkletHref(nseIndices, { INDEX: [i.asset.toUpperCase(), i.asset, i.inception, split] }),
        since: i.inception,
        files: periods(i.inception, split),
      })),
      skipped: items.length - picked.length,
    };
  },
};

// Bookmarks for the datasets in `items` that this site's bookmarklet can fetch, or null if there are none.
// `options.split` is 'FY' (financial year, the default) or 'CY' (calendar year).
export const bookmarkletFor = (site, items, options) => BUILDERS[site]?.(items, options) || null;
