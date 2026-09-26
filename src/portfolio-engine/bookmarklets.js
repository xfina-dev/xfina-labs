// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the user's
// disk from a site that only serves it to a page on that site. One bookmark per site, made once and reused: it
// covers the supported indexes selected in the list, and works out for itself what is new (see the script).
// Add a site here and its card in the download list gets an Assisted tab.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import nseEtf from './bookmarklets/nse-etf.js?raw';
import amfiNav from './bookmarklets/amfi-nav.js?raw';
import { bookmarkletHref } from './bookmarklet.js';
import { nodes } from './guide.js';

// The equity indexes the NSE Indices page lists under Total Returns (Broad Market).
const NSE_SUPPORTED = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

// Debt indexes are not under Total Returns. The site serves them under Historical Index Data (Fixed Income), keyed by
// the catalogue's name for the index: [the page's index name, its group there, a label].
const NSE_DEBT = {
  'Nifty 10 yr Benchmark G-Sec Index': ['NIFTY 10 YR BENCHMARK G-SEC', 'Government Securities', 'Nifty 10 yr Benchmark G-Sec'],
  'NSE short-duration debt index (Liquid or 1D Rate)': ['NIFTY 1D RATE INDEX', 'Money Market', 'Nifty 1D Rate Index'],
};
// When the catalogue has no start date for a debt index, ask from here; earlier years just come back empty.
const DEBT_FROM = '2010-01-01';

const BUILDERS = {
  'NSE Indices': (items) => {
    // The bookmark covers the supported indexes the user has selected (those with a known start date). It keeps
    // no dates, so it stays valid, and its per-index memory carries over if the selection changes and it is dragged again.
    const all = nodes
      .filter((n) => n.vehicle === 'index' && n.class === 'equity' && n.region === 'india' && NSE_SUPPORTED.includes(n.asset))
      .flatMap((n) => n.instruments.filter((i) => i.inception).map((i) => [n.asset.toUpperCase(), n.asset, i.inception]));
    const supported = items.filter((i) => i.kind === 'Index' && (NSE_SUPPORTED.includes(i.asset) || NSE_DEBT[i.name]));
    const chosen = all.filter((x) => supported.some((i) => i.asset === x[1]));
    supported.filter((i) => NSE_DEBT[i.name]).forEach((i) => {
      const d = NSE_DEBT[i.name];
      chosen.push([d[0], d[2], i.inception || DEBT_FROM, 'h', 'Fixed Income', d[1]]);
    });
    if (!chosen.length) return null;
    return {
      site: 'NSE Indices',
      openUrl: 'https://www.niftyindices.com/reports/historical-data',
      openLabel: 'Open NSE Indices',
      termsUrl: 'https://www.niftyindices.com/terms-of-use',
      label: 'Xfina · NSE Indices',
      href: bookmarkletHref(nseIndices, { INDEXES: chosen }),
      indexes: chosen.map((x) => x[1]),
      action: 'csv format',
      skipped: items.length - supported.length,
    };
  },
  // NSE's own price and volume report for exchange-listed ETFs, by symbol. NSE's terms restrict automated data
  // collection, so this one carries a plain caution on the card (see GetData.vue).
  NSE: (items) => {
    const etfs = items.filter((i) => i.kind === 'ETF' && i.how === 'nseEtf' && i.code);
    if (!etfs.length) return null;
    // Some listing dates are unknown; asking from 2014 costs only a few empty years for those.
    const symbols = etfs.map((i) => [i.code, i.name, i.inception || '2014-01-01']);
    return {
      site: 'NSE',
      openUrl: 'https://www.nseindia.com/report-detail/eq_security',
      openLabel: 'Open NSE Security-wise Archives',
      termsUrl: 'https://www.nseindia.com/nse-terms-of-use',
      label: 'Xfina · NSE ETFs',
      href: bookmarkletHref(nseEtf, { SYMBOLS: symbols }),
      indexes: etfs.map((i) => i.code),
      action: 'Download (.csv)',
      caution: 'NSE\'s terms of use restrict automated data collection. This bookmark only does the clicking you would do on that page, one file at a time and at a human pace, but the terms say what they say, so the decision to use it is yours.',
      skipped: items.length - etfs.length,
    };
  },
  // AMFI's own NAV History page, for the mutual fund and fund-of-fund schemes (their first NAV date is known).
  AMFI: (items) => {
    const funds = items.filter((i) => i.kind === 'MF' && i.inception);
    if (!funds.length) return null;
    return {
      site: 'AMFI',
      openUrl: 'https://www.amfiindia.com/net-asset-value/nav-history',
      openLabel: 'Open AMFI NAV History',
      termsUrl: 'https://www.amfiindia.com/terms-of-use',
      label: 'Xfina · AMFI NAV',
      href: bookmarkletHref(amfiNav, { SCHEMES: funds.map((i) => [i.name, i.name, i.inception]) }),
      indexes: funds.map((i) => i.name),
      action: 'Excel download',
      skipped: items.length - funds.length,
    };
  },
};

// The bookmark for a site, or null if it has none for the datasets in `items`.
export const bookmarkletFor = (site, items) => BUILDERS[site]?.(items) || null;
