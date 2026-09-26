// The "How to get data" wizard: asset class → region → vehicle (→ US or Irish listing, for ETFs)
// → asset → the three instruments with the longest history.
//
// The tree itself is generated, not typed: `node scripts/build-tree.mjs` writes tree.json from
// live data (see that script for where each date comes from). This module only reads it and holds
// the download steps for each website.
//
// The click-by-click steps are written from how these sites usually work and are not yet walked
// through. Verify them, and record the GIFs, before this ships.
//
// Xfina reads each source's own format, so nothing here asks the user to reshape a file.
import tree from './tree.json';

export const CLASSES = [
  { id: 'equity', title: 'Equity', blurb: 'Stock indices, index ETFs and index funds' },
  { id: 'gold', title: 'Gold', blurb: 'Gold price, gold ETFs and gold funds' },
  { id: 'debt', title: 'Debt', blurb: 'Short and long duration government debt' },
];
export const REGIONS = [
  { id: 'india', title: 'India', blurb: 'INR, Indian markets' },
  { id: 'us', title: 'US', blurb: 'USD, US markets' },
  { id: 'global', title: 'Global', blurb: 'USD, world-wide markets' },
];
export const VEHICLES = [
  { id: 'index', title: 'Index', blurb: 'The benchmark itself (total return)' },
  { id: 'etf', title: 'ETF', blurb: 'What you could have held on an exchange' },
  { id: 'mf', title: 'MF', blurb: 'Mutual fund NAV' },
];
// Irish first: it is the default for US and Global ETFs.
export const LISTINGS = [
  { id: 'irish', title: 'Irish ETFs', blurb: 'Irish-domiciled UCITS ETFs' },
  { id: 'us', title: 'US ETFs', blurb: 'Listed in the US' },
];

// How a source is downloaded and what you get. `site` is the website: the download list groups by it,
// so a user visits each site once. Steps are short on purpose.
export const HOW = {
  nseTri: {
    site: 'NSE Indices',
    title: 'NSE Indices: Total Returns Index',
    steps: ['Open the Historical Data page.', 'Pick the index, then the Total Returns Index series (not the price series).', 'Set the widest date range the site allows. If it caps the range, download in parts.', 'Download the file and import every part as it is.'],
    format: 'A table with a date and an index value, as NSE publishes it.',
  },
  mfapi: {
    site: 'AMFI',
    title: 'AMFI NAV history, as JSON',
    steps: ['Open the NAV data link. It shows the scheme\'s full NAV history.', 'Save the page (right-click, Save As) as a file.', 'Prefer a spreadsheet? Use AMFI NAV History instead: pick the fund house, the scheme and the date range.'],
    format: 'A JSON list of dates and NAVs, as mfapi.in republishes AMFI\'s data.',
  },
  amfi: {
    site: 'AMFI',
    title: 'AMFI: NAV history',
    steps: ['Open NAV History.', 'Choose Historical NAV, then the fund house and the scheme.', 'Pick Direct plan, Growth option so distributions stay reinvested.', 'Set the date range and download.'],
    format: 'A date and NAV per line, as AMFI publishes it.',
  },
  nseEtf: {
    site: 'AMFI',
    title: 'Indian ETF: NAV (preferred) or price',
    steps: ['For NAV, use AMFI NAV History and pick the ETF as the scheme.', 'For exchange price, open the NSE quote page for the symbol and use its historical data.', 'Download the widest range available.'],
    format: 'NAV or price by date, as published.',
  },
  yahoo: {
    site: 'Yahoo Finance',
    title: 'Yahoo Finance: price history',
    steps: ['Open the history page for the ticker.', 'Set the time period to Max and the frequency to Daily.', 'Download. Keep the Adj Close column: it includes dividends.'],
    format: 'A CSV with Date, Open, High, Low, Close, Adj Close and Volume.',
  },
  ishares: {
    site: 'iShares',
    title: 'iShares: fund page',
    steps: ['Open the fund page.', 'Find the historical NAV or performance data and choose the widest range.', 'Download it. An accumulating fund\'s NAV already includes income.'],
    format: 'NAV by date, as iShares publishes it.',
  },
  msci: {
    site: 'MSCI',
    title: 'MSCI: index levels',
    steps: ['Open the index page, then End of Day Index Data.', 'Choose the Net Total Return variant in USD.', 'Set the widest date range and download.'],
    format: 'A date and an index level, as MSCI publishes it.',
  },
  nasdaqIdx: {
    site: 'Nasdaq Indexes',
    title: 'Nasdaq Indexes: history',
    steps: ['Open the index history page.', 'Set the date range as wide as allowed.', 'Download the levels. This is the total return series, XNDX.'],
    format: 'A date and an index level, as Nasdaq publishes it.',
  },
  spdji: {
    site: 'S&P Dow Jones Indices',
    title: 'S&P Dow Jones Indices',
    steps: ['Open the index page and look for its historical data or performance download.', 'Choose the Total Return series.', 'Full daily history is normally for subscribers. If it is not offered to you, use an ETF instead.'],
    format: 'A date and an index level, as S&P publishes it.',
  },
  lbma: {
    site: 'LBMA',
    title: 'LBMA: Gold Price',
    steps: ['Open Precious Metal Prices.', 'Choose the Gold Price (PM), in USD.', 'Download the full history.'],
    format: 'A date and a USD price, as LBMA publishes it.',
  },
  ibja: {
    site: 'IBJA',
    title: 'IBJA: domestic gold rates',
    steps: ['Open the IBJA rates page.', 'Use its archive or history option for the date range you need.', 'Download it. Only some ranges may be offered; if so, import each part.'],
    format: 'Daily INR gold rates, as IBJA publishes them.',
  },
};


const DATE_SOURCE = { mfapi: 'first NAV on AMFI', issuer: 'issuer\'s inception date', manual: 'launch date, not yet verified', publisher: 'publisher\'s start date' };
export const dateNote = (i) => (i.inception ? `History from ${i.inception}` : 'Full published history');
export const dateSourceNote = (i) => (i.inception ? DATE_SOURCE[i.dateSource] || '' : '');

export const nodes = tree.nodes;
export const generatedAt = tree.generatedAt;
const same = (n, cls, region, vehicle, listing) => n.class === cls && n.region === region && n.vehicle === vehicle && (n.listing || null) === (listing || null);

// What each step of the wizard offers, given the choices before it.
export const vehiclesFor = (cls, region) => VEHICLES.filter((v) => nodes.some((n) => n.class === cls && n.region === region && n.vehicle === v.id)).map((v) => ({ ...v, count: nodes.filter((n) => n.class === cls && n.region === region && n.vehicle === v.id).reduce((s, n) => s + n.instruments.length, 0) }));
export const listingsFor = (cls, region) => LISTINGS.filter((l) => nodes.some((n) => n.class === cls && n.region === region && n.vehicle === 'etf' && n.listing === l.id));
export const hasListings = (cls, region) => listingsFor(cls, region).length > 0;
export const assetsFor = (cls, region, vehicle, listing) => [...new Set(nodes.filter((n) => same(n, cls, region, vehicle, listing)).map((n) => n.asset))];
// Oldest first, three at most (the tree is built that way).
export const instrumentsFor = (cls, region, vehicle, listing, asset) => nodes.find((n) => same(n, cls, region, vehicle, listing) && n.asset === asset)?.instruments || [];

// Every asset for the chosen path, each with its instruments, oldest first. The guide groups by asset
// instead of asking the user to pick one.
export const groupsFor = (cls, region, vehicle, listing) => nodes.filter((n) => same(n, cls, region, vehicle, listing)).map((n) => ({ asset: n.asset, instruments: n.instruments }));

// Indexes are simply listed: there is no listing or asset to choose, every index for the region is shown.
export const indexesFor = (cls, region) => nodes.filter((n) => n.class === cls && n.region === region && n.vehicle === 'index').flatMap((n) => n.instruments.map((i) => ({ ...i, asset: n.asset })));

export function findDataset(id) {
  for (const n of nodes) {
    const hit = n.instruments.find((i) => i.id === id);
    if (hit) return { ...hit, asset: n.asset, cls: n.class, region: n.region, vehicle: n.vehicle };
  }
  return null;
}
