// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the user's
// disk from a site that only serves it to a page on that site. One bookmark per site, made once and reused: it
// covers every index the site's bookmarklet supports, and works out for itself what is new (see the script).
// Add a site here and its card in the download list gets an Assisted tab.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import { bookmarkletHref } from './bookmarklet.js';
import { nodes } from './guide.js';

// The indexes the NSE Indices page lists under Total Returns (Broad Market). Debt indices are not among them.
const NSE_SUPPORTED = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

const BUILDERS = {
  'NSE Indices': (items) => {
    // The bookmark covers every supported index that has a known start date, whichever the user has added, so
    // it never needs to be made again. Adding to the list later does not change it.
    const all = nodes
      .filter((n) => n.vehicle === 'index' && n.class === 'equity' && n.region === 'india' && NSE_SUPPORTED.includes(n.asset))
      .flatMap((n) => n.instruments.filter((i) => i.inception).map((i) => [n.asset.toUpperCase(), n.asset, i.inception]));
    if (!all.length) return null;
    const supported = items.filter((i) => i.kind === 'Index' && NSE_SUPPORTED.includes(i.asset));
    if (!supported.length) return null;
    return {
      site: 'NSE Indices',
      openUrl: 'https://www.niftyindices.com/reports/historical-data',
      openLabel: 'Open NSE Indices',
      termsUrl: 'https://www.niftyindices.com/terms-of-use',
      label: 'Xfina · NSE Indices',
      href: bookmarkletHref(nseIndices, { INDEXES: all }),
      indexes: all.map((x) => x[1]),
      skipped: items.length - supported.length,
    };
  },
};

// The bookmark for a site, or null if it has none for the datasets in `items`.
export const bookmarkletFor = (site, items) => BUILDERS[site]?.(items) || null;
