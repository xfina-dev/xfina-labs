// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the
// user's disk from a site that only serves it to a page on that site. Add a site here and its card in
// the download list gets a draggable button.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import { bookmarkletHref } from './bookmarklet.js';

export const BOOKMARKLETS = {
  'NSE Indices': {
    label: 'Xfina · NSE Indices',
    href: bookmarkletHref(nseIndices),
    openUrl: 'https://www.niftyindices.com/reports/historical-data',
    openLabel: 'Open NSE Indices',
    covers: 'Nifty 50, Next 50, Midcap 150 and Smallcap 250 Total Returns Index, full history',
  },
};
