// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the
// user's disk from a site that only serves it to a page on that site. A bookmark is generated per dataset
// the user added, so each tab shows the progress of one. Add a site here and its card in the download
// list gets draggable buttons.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import { bookmarkletHref } from './bookmarklet.js';

// The indexes the NSE Indices page lists under Total Returns (Broad Market). Debt indices are not among them.
const NSE_SUPPORTED = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

const BUILDERS = {
  'NSE Indices': (items) => {
    const picked = items.filter((i) => i.kind === 'Index' && NSE_SUPPORTED.includes(i.asset) && i.inception);
    if (!picked.length) return null;
    return {
      openUrl: 'https://www.niftyindices.com/reports/historical-data',
      openLabel: 'Open NSE Indices',
      // One bookmark per index: open the page in one tab per index and run each bookmark in its own tab.
      bookmarks: picked.map((i) => ({
        label: `Xfina · ${i.asset}`,
        href: bookmarkletHref(nseIndices, { INDEX: [i.asset.toUpperCase(), i.asset, i.inception] }),
        since: i.inception,
        years: Math.ceil((Date.now() - new Date(i.inception).getTime()) / (364 * 86400000)),
      })),
      skipped: items.length - picked.length,
    };
  },
};

// Bookmarks for the datasets in `items` that this site's bookmarklet can fetch, or null if there are none.
export const bookmarkletFor = (site, items) => BUILDERS[site]?.(items) || null;
