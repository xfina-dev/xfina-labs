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
// The first one that exists for a choice is its default: Canada (only Global gold has it), then Irish, US and India.
export const LISTINGS = [
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
  mfapi: {
    site: 'AMFI',
    title: 'AMFI: NAV history',
    steps: ['Open NAV History and choose Historical NAV for a period.', 'Pick the fund house, then the scheme (the plan and option named here).', 'Set From and To. The page allows at most 5 years at a time, so a long history is several downloads.', 'Press Go, then download the Excel file and import every part as it is.'],
    format: 'AMFI\'s own Excel: the net asset value, repurchase and sale price and the NAV date, one row per day.',
  },
  amfi: {
    site: 'AMFI',
    title: 'AMFI: NAV history',
    steps: ['Open NAV History.', 'Choose Historical NAV, then the fund house and the scheme.', 'Pick Direct plan, Growth option so distributions stay reinvested.', 'Set the date range and download.'],
    format: 'A date and NAV per line, as AMFI publishes it.',
  },
  nseEtf: {
    site: 'NSE',
    title: 'NSE: ETF price history',
    steps: ['Open the NSE historical price report.', 'Choose Security-wise price and volume data, then enter the ETF\'s symbol and the EQ series.', 'Set the widest date range the report allows. If it caps the range, download in parts.', 'Download the file and import every part as it is.'],
    format: 'NSE\'s price and volume table, with a row per trading day. It is the exchange price, not NAV.',
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
    steps: ['Open the index history page.', 'Set the start and end dates. The calendar\'s year list only reaches ten years back. For earlier dates, press Download once and then edit startDate and endDate in the download address (for example startDate=1999-03-01T00:00:00.000).', 'Download the levels for the series on the row: XNDX is total return (from March 1999), NDX is the price index without dividends (from 1985).'],
    format: 'A date and an index level, as Nasdaq publishes it.',
  },
};


const DATE_SOURCE = { mfapi: 'first NAV on AMFI', amfi: 'first NAV on AMFI', issuer: 'issuer\'s inception date', manual: 'launch date, not yet verified', publisher: 'publisher\'s start date', nse: 'first row on NSE Indices', nasdaq: 'first row on Nasdaq Indexes' };
export const dateNote = (i) => (i.inception ? `History from ${i.inception}${i.maxYears ? `; the site downloads the last ${i.maxYears} years` : ''}` : i.kind === 'Index' ? 'Full published history' : 'Listing date not recorded');
// Whole years of history up to today, rounded down, and no more than the source lets you download; null when the start date is not known.
export const yearsOf = (i) => {
  if (!i.inception) return null;
  const y = Math.max(0, Math.floor((Date.now() - new Date(i.inception).getTime()) / (365.2425 * 864e5)));
  return i.maxYears ? Math.min(y, i.maxYears) : y;
};
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
