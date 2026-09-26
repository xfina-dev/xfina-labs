// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the user's
// disk from a site that only serves it to a page on that site. One bookmark per site, made once and reused: it
// covers the supported indexes selected in the list, and works out for itself what is new (see the script).
// Add a site here and its card in the download list gets an Assisted tab.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import { bookmarkletHref } from './bookmarklet.js';
import { nodes } from './guide.js';

// The indexes the NSE Indices page lists under Total Returns (Broad Market). Debt indices are not among them.
const NSE_SUPPORTED = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

const BUILDERS = {
  'NSE Indices': (items) => {
    // The bookmark covers the supported indexes the user has selected (those with a known start date). It keeps
    // no dates, so it stays valid, and its per-index memory carries over if the selection changes and it is dragged again.
    const all = nodes
      .filter((n) => n.vehicle === 'index' && n.class === 'equity' && n.region === 'india' && NSE_SUPPORTED.includes(n.asset))
      .flatMap((n) => n.instruments.filter((i) => i.inception).map((i) => [n.asset.toUpperCase(), n.asset, i.inception]));
    const supported = items.filter((i) => i.kind === 'Index' && NSE_SUPPORTED.includes(i.asset));
    const chosen = all.filter((x) => supported.some((i) => i.asset === x[1]));
    if (!chosen.length) return null;
    return {
      site: 'NSE Indices',
      openUrl: 'https://www.niftyindices.com/reports/historical-data',
      openLabel: 'Open NSE Indices',
      termsUrl: 'https://www.niftyindices.com/terms-of-use',
      label: 'Xfina · NSE Indices',
      href: bookmarkletHref(nseIndices, { INDEXES: chosen }),
      indexes: chosen.map((x) => x[1]),
      skipped: items.length - supported.length,
    };
  },
};

// The bookmark for a site, or null if it has none for the datasets in `items`.
export const bookmarkletFor = (site, items) => BUILDERS[site]?.(items) || null;
