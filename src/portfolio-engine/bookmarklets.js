// Bookmarklets by website (the same names the download list groups by). Each one downloads data to the user's
// disk from a site that only serves it to a page on that site. One bookmark per site, made once and reused: it
// covers the supported indexes selected in the list, and works out for itself what is new (see the script).
// Add a site here and its card in the download list gets an Assisted tab.
import nseIndices from './bookmarklets/nse-indices.js?raw';
import nseEtf from './bookmarklets/nse-etf.js?raw';
import amfiNav from './bookmarklets/amfi-nav.js?raw';
import yahooFinance from './bookmarklets/yahoo-finance.js?raw';
import mcxSpot from './bookmarklets/mcx-spot.js?raw';
import core from './bookmarklets/core.js?raw';
import { bookmarkletHref } from './bookmarklet.js';
import { nodes, NSE_DEBT, HOW } from './guide.js';

// The equity indexes the NSE Indices page lists under Total Returns (Broad Market).
const NSE_SUPPORTED = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

// When the catalogue has no start date for a debt index, ask from here; earlier years just come back empty.
const DEBT_FROM = '2010-01-01';

// MCX's own commodity code and the location it is actually polled at, keyed by the catalogue's instrument id.
// Only gold's Ahmedabad spot price is polled for now (MCX only polls a handful of locations per commodity;
// Mumbai returns nothing for gold, checked live).
const MCX_PRODUCTS = {
  'idx-mcx-spot-market-price-gold-ahmedabad': ['GOLD', 'AHMEDABAD'],
};

// A site file built on the shared panel (core.js) carries XFINA_CORE; where the core goes. A function replacement,
// so `$` in the core is not read as a replacement pattern.
const withCore = (src) => src.replace('XFINA_CORE;', () => core);

// A single-page site's own download page, named as the card names it (HOW's page and pageLabel).
const open = (how) => ({ openUrl: how.page, openLabel: `Open ${how.pageLabel}` });

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
      ...open(HOW.nseTri),
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
      ...open(HOW.nseEtf),
      termsUrl: 'https://www.nseindia.com/nse-terms-of-use',
      label: 'Xfina · NSE ETFs',
      href: bookmarkletHref(withCore(nseEtf), { SYMBOLS: symbols }),
      indexes: etfs.map((i) => i.code),
      action: 'Download (.csv)',
      caution: 'NSE\'s terms of use restrict automated data collection. This bookmark only does the clicking you would do on that page, one file at a time and at a human pace, but the terms say what they say, so the decision to use it is yours.',
      skipped: items.length - etfs.length,
    };
  },
  // Yahoo Finance: only for the handful of funds with no issuer, exchange or index NAV source. Takes no per-item
  // parameters; it works whichever ticker's own history page is open when it's clicked, one file per click.
  'Yahoo Finance': (items) => {
    // Yahoo's own ticker in the page address (e.g. VUAA.L for the LSE listing, or %5EGSPC for an index) can differ
    // from the catalogue's display code, or an index row may have no `code` at all; it only lives in the item's own
    // Yahoo link, so read it from there (decoded, matching what the bookmark's own decodeURIComponent produces).
    const yTicker = (i) => {
      const m = i.links.find((l) => l.url.includes('finance.yahoo.com'))?.url.match(/\/quote\/([^/]+)\//);
      return m ? decodeURIComponent(m[1]) : i.code;
    };
    const label = (i) => i.code || yTicker(i);
    const starts = Object.fromEntries(items.filter((i) => i.inception).map((i) => [yTicker(i), i.inception]));
    return {
      site: 'Yahoo Finance',
      openUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(yTicker(items[0]))}/history/`,
      openLabel: `Open ${label(items[0])} on Yahoo Finance`,
      termsUrl: 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html',
      label: 'Xfina · Yahoo Finance',
      href: bookmarkletHref(yahooFinance, { STARTS: starts }),
      indexes: items.map(label),
      action: 'Save CSV',
      oneShot: true,
      caution: 'Yahoo\'s terms bar automated collection for any purpose, with no personal-use exception, and Yahoo removed its own download button. This bookmark opens a small panel on the ticker\'s own history page and, on a click, saves the same table you would otherwise copy out by hand: nothing it could not equally get by a person reading the page. Used only where no fund, exchange or index has a real download.',
      skipped: 0,
    };
  },
  // MCX's own Spot Market Price Archives, for the spot indexes it polls (gold only, at Ahmedabad, for now).
  MCX: (items) => {
    const spots = items.filter((i) => i.how === 'mcxSpot' && MCX_PRODUCTS[i.id]);
    if (!spots.length) return null;
    return {
      site: 'MCX',
      ...open(HOW.mcxSpot),
      termsUrl: 'https://www.mcxindia.com/terms-and-conditions-of-usage-for-website',
      label: 'Xfina · MCX Spot Price',
      href: bookmarkletHref(mcxSpot, { PRODUCTS: spots.map((i) => [...MCX_PRODUCTS[i.id], i.name, i.inception]) }),
      indexes: spots.map((i) => i.name),
      action: 'Excel export',
      caution: 'MCX\'s terms of use restrict automated data collection, the same as NSE\'s. This bookmark only does the clicking you would do on that page, one file at a time and at a human pace, but the terms say what they say, so the decision to use it is yours.',
      skipped: items.length - spots.length,
    };
  },
  // AMFI's own NAV History page, for the mutual fund and fund-of-fund schemes (their first NAV date is known).
  AMFI: (items) => {
    const funds = items.filter((i) => i.kind === 'MF' && i.inception);
    if (!funds.length) return null;
    return {
      site: 'AMFI',
      ...open(HOW.amfi),
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
