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
  { id: 'debt', title: 'Debt', blurb: 'Short and long duration government debt' },
  { id: 'gold', title: 'Gold', blurb: 'Gold price, gold ETFs and gold funds' },
];
export const REGIONS = [
  { id: 'india', title: 'India', blurb: 'INR, Indian markets' },
  { id: 'us', title: 'US', blurb: 'USD, US markets' },
  { id: 'global', title: 'Global', blurb: 'USD, world-wide markets' },
];
// Mutual fund plans. Regular first: it is the default because it has the longer history.
export const PLANS = [
  { id: 'regular', title: 'Regular', blurb: 'More history, higher cost' },
  { id: 'direct', title: 'Direct', blurb: 'Cheaper, history from 2013' },
];
export const VEHICLES = [
  { id: 'index', title: 'Index', blurb: 'The benchmark itself (total return)' },
  { id: 'etf', title: 'ETF', blurb: 'What you could have held on an exchange' },
  { id: 'mf', title: 'MF', blurb: 'Mutual fund NAV' },
];
// The first one that exists for a choice is its default: Switzerland (only Global gold has it so far), then
// Canada, Ireland, US and India.
export const LISTINGS = [
  { id: 'switzerland', title: 'Switzerland', blurb: 'Swiss-domiciled funds, listed on SIX, priced in USD' },
  { id: 'canada', title: 'Canada', blurb: 'Canadian trusts and funds, priced in USD or CAD' },
  { id: 'irish', title: 'Ireland', blurb: 'UCITS ETFs, usually listed in London' },
  { id: 'us', title: 'US', blurb: 'US-listed ETFs, in USD' },
  { id: 'india', title: 'India', blurb: 'Indian ETFs on foreign indices, in INR' },
];

// How a source is downloaded and what you get. `site` is the website: the download list groups by it,
// so a user visits each site once. Steps are short on purpose.
export const HOW = {
  nseTri: {
    site: 'NSE Indices',
    title: 'NSE Indices: Total Returns Index',
    steps: ['Open the Historical Data page.', 'Pick the index, then the Total Returns Index series (not the price series).', 'Set the widest date range the site allows. If it caps the range, download in parts.', 'Download the file and import every part as it is.'],
    format: 'NSE\'s own CSV: the index name, the date, the Total Returns Index and the Net Total Return Index. The page exports at most a year at a time, so a long history is several files.',
  },
  amfi: {
    site: 'AMFI',
    title: 'AMFI: NAV history',
    steps: ['Open NAV History and choose Historical NAV for a period.', 'Pick the fund house, then the scheme (the plan and option named here).', 'Set From and To. The page allows at most 5 years at a time, so a long history is several downloads.', 'Press Go, then download the Excel file and import every part as it is.'],
    format: 'AMFI\'s own Excel: the net asset value, repurchase and sale price and the NAV date, one row per day. Nothing here comes from mfapi.in or any other republisher.',
  },
  nseEtf: {
    site: 'NSE',
    title: 'NSE: ETF price history',
    steps: ['Open the NSE historical price report.', 'Choose Security-wise price and volume data, then enter the ETF\'s symbol and the EQ series.', 'Set the widest date range the report allows. If it caps the range, download in parts.', 'Download the file and import every part as it is.'],
    format: 'NSE\'s price and volume table, with a row per trading day. It is the exchange price, not NAV.',
  },
  yahoo: {
    site: 'Yahoo Finance',
    title: 'Yahoo Finance: price history (by hand, no download)',
    steps: [
      'Open the history page for the ticker.',
      'Open the date-range picker and set the start as early as it goes (back past the fund\'s launch is fine) and the end to today. Yahoo removed its Download button, so there is no file to fetch.',
      'Set the frequency to Monthly, so the table is a manageable size to work with.',
      'Select the table (click the first row, then shift-click the last) and copy it. Paste into a spreadsheet and save as CSV, or type the rows in by hand for a short run.',
    ],
    format: 'Date, Open, High, Low, Close, Adj Close and Volume, as shown on the page. Adj Close includes dividends. This is exchange price, not the fund\'s own NAV; used only where no issuer or exchange NAV history is available.',
  },
  ishares: {
    site: 'iShares',
    title: 'iShares: NAV history',
    steps: ['Open the fund page.', 'Press its "Data Download" link.', 'Open the Historical (US funds) or Historical NAVs (UCITS funds) sheet. It is the full daily history from launch.'],
    format: 'An Excel/XML file with a date and the NAV per share, as iShares publishes it. An accumulating fund\'s NAV already includes income.',
  },
  ssga: {
    site: 'SSGA',
    title: 'State Street: NAV history',
    steps: ['Open the fund page.', 'Press "Most Recent NAV / NAV History".', 'The download is the full daily NAV history from launch.'],
    format: 'An Excel file with a date, the NAV, shares outstanding and total net assets, as State Street publishes it.',
  },
  spdrgold: {
    site: 'SPDR Gold Shares',
    title: 'SPDR Gold Shares: historical data',
    steps: ['Open the Historical Data page.', 'Download. It is the full daily history from launch.'],
    format: 'An Excel file with a date, the closing price, the NAV per share and ounces of gold per share, as State Street publishes it.',
  },
  msci: {
    site: 'MSCI',
    title: 'MSCI: index levels',
    steps: ['Open the index page and its Performance tab.', 'Under Cumulative performance, choose Full history.', 'Press the download icon next to Compare. No account is needed.'],
    format: 'An Excel file with a date and the index level, monthly, as MSCI publishes it. Full history on the free page starts 1998-12-31; MSCI\'s own longer history is licensed. The page shows one return variant with no way to switch it, and it is not labelled Price, Gross or Net, so check the numbers before assuming which one it is.',
  },
  mcxSpot: {
    site: 'MCX',
    title: 'MCX: Spot Market Price',
    steps: ['Open Spot Market Price and its Archives tab.', 'Set Commodity to GOLD and Location to AHMEDABAD (the only location MCX polls gold at; other cities return nothing).', 'Set the widest date range the site allows (there is no cap: one query returns the full history).', 'Press Show, then press the page\'s own Excel export button.'],
    format: 'Commodity, unit, location, spot price in INR per 10 grams, an up/down mark, and a date and time, as MCX publishes it, wrapped as an .xls file. Prices are polled several times a day, not once (and MCX\'s own Session tag for which poll is inconsistent before recent years), so every reading is kept; pick one reading per day (for example the latest) on import.',
  },
};


const DATE_SOURCE = { direct: 'Direct plans began on 1 Jan 2013', amfi: 'first NAV on AMFI', issuer: 'issuer\'s inception date', manual: 'launch date, not yet verified', publisher: 'publisher\'s start date', nse: 'first row on NSE Indices', yahoo: 'first row on Yahoo Finance', mcx: 'first row on MCX Spot Market Price' };
export const dateNote = (i) => (i.inception ? `History from ${i.inception}` : i.kind === 'Index' ? 'Full published history' : 'Listing date not recorded');
// Whole years of history up to today, rounded down; null when the start date is not known.
export const yearsOf = (i) => (i.inception ? Math.max(0, Math.floor((Date.now() - new Date(i.inception).getTime()) / (365.2425 * 864e5))) : null);
export const dateSourceNote = (i) => (i.inception ? DATE_SOURCE[i.dateSource] || '' : '');

export const nodes = tree.nodes;
export const generatedAt = tree.generatedAt;
const same = (n, cls, region, vehicle, listing) => n.class === cls && n.region === region && n.vehicle === vehicle && (n.listing || null) === (listing || null);

// What each step of the wizard offers, given the choices before it.
export const vehiclesFor = (cls, region) => VEHICLES.filter((v) => nodes.some((n) => n.class === cls && n.region === region && n.vehicle === v.id)).map((v) => ({ ...v, count: nodes.filter((n) => n.class === cls && n.region === region && n.vehicle === v.id).reduce((s, n) => s + n.instruments.length, 0) }));
// Lane 4 holds a listing for ETFs (Irish, US, Indian) and a plan for mutual funds (Regular, Direct).
export const listingsFor = (cls, region, vehicle = 'etf') => (vehicle === 'mf' ? PLANS : vehicle === 'etf' ? LISTINGS : []).filter((l) => nodes.some((n) => n.class === cls && n.region === region && n.vehicle === vehicle && n.listing === l.id));
export const hasListings = (cls, region, vehicle) => listingsFor(cls, region, vehicle).length > 0;
export const assetsFor = (cls, region, vehicle, listing) => [...new Set(nodes.filter((n) => same(n, cls, region, vehicle, listing)).map((n) => n.asset))];
// Oldest first, three at most (the tree is built that way).
export const instrumentsFor = (cls, region, vehicle, listing, asset) => nodes.find((n) => same(n, cls, region, vehicle, listing) && n.asset === asset)?.instruments || [];

// Every asset for the chosen path, each with its instruments, oldest first. The guide groups by asset
// instead of asking the user to pick one. Each instrument carries its node's own asset/region/listing (not
// just the group), so a row can be read on its own, e.g. by distFlag below.
const withNode = (n) => n.instruments.map((i) => ({ ...i, asset: n.asset, cls: n.class, region: n.region, vehicle: n.vehicle, listing: n.listing || null }));
export const groupsFor = (cls, region, vehicle, listing) => nodes.filter((n) => same(n, cls, region, vehicle, listing)).map((n) => ({ asset: n.asset, instruments: withNode(n) }));

// Indexes are simply listed: there is no listing or asset to choose, every index for the region is shown.
export const indexesFor = (cls, region) => nodes.filter((n) => n.class === cls && n.region === region && n.vehicle === 'index').flatMap(withNode);

// Accumulating vs distributing, shown only where it is a real, made choice: an ETF holding an income-bearing
// asset (equity, bonds -- not gold, which yields nothing to distribute). A UCITS/CH fund names its own
// share class ("... UCITS ETF (Acc)"); one with no such marker is the Distributing share class (the Acc
// alternative either doesn't exist or wasn't picked, IB01 being the one case here without an Acc option).
// A native US listing is Distributing by law -- a '40 Act RIC must pay out at least 90% of its net income
// every year to keep its pass-through tax status, not a per-fund choice. India (domestic listing, or the
// India-listed feeder ETFs on foreign indices) uses neither UCITS term, so it is left out here.
export function distFlag(i) {
  if (i.kind !== 'ETF' || i.asset === 'Gold' || i.region === 'india' || i.listing === 'india') return null;
  if (/\(Acc\)/i.test(i.name)) return 'Acc';
  if (/\(Dist\)/i.test(i.name)) return 'Dist';
  return 'Dist';
}

export function findDataset(id) {
  for (const n of nodes) {
    const hit = n.instruments.find((i) => i.id === id);
    if (hit) return { ...hit, asset: n.asset, cls: n.class, region: n.region, vehicle: n.vehicle, listing: n.listing || null };
  }
  return null;
}
