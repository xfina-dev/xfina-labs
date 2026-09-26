// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the
// user's disk from a site that only serves it to a page on that site. The bookmark is generated from the
// datasets the user added, so it fetches exactly those. Add a site here and its card in the download
// list gets a draggable button.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import { bookmarkletHref } from './bookmarklet.js';

// The indexes the NSE Indices endpoint serves. Debt indices are not among them.
const NSE_SUPPORTED = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

const BUILDERS = {
  'NSE Indices': (items) => {
    const picked = items.filter((i) => i.kind === 'Index' && NSE_SUPPORTED.includes(i.asset));
    if (!picked.length) return null;
    const indexes = picked.map((i) => [i.asset.toUpperCase(), i.asset]);
    return {
      label: `Xfina · NSE Indices (${picked.length})`,
      href: bookmarkletHref(nseIndices, { INDEXES: indexes }),
      openUrl: 'https://www.niftyindices.com/reports/historical-data',
      openLabel: 'Open NSE Indices',
      covers: picked.map((i) => i.name).join(', '),
      skipped: items.length - picked.length,
    };
  },
};

// A bookmark for the datasets in `items` that this site's bookmarklet can fetch, or null if there are none.
export const bookmarkletFor = (site, items) => BUILDERS[site]?.(items) || null;
