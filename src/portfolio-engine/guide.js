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
// Mutual fund plans. Regular first: it is the default because it has the longer history. US funds are a third
// choice for US assets only: US-domiciled index mutual funds (Vanguard's 500 Index Fund from 1976), not Indian plans.
export const PLANS = [
  { id: 'regular', title: 'Regular', blurb: 'More history, higher cost' },
  { id: 'direct', title: 'Direct', blurb: 'Cheaper, history from 2013' },
  { id: 'usfund', title: 'US funds', blurb: 'US index mutual funds, in USD' },
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

// NSE's debt indexes are not under Total returns Index Values. The site serves them under Historical Index Data
// (Fixed Income), keyed by the catalogue's name for the index: [the page's index name, its group there, a label].
// Checked live: the 10 yr one is the plain G-Sec index, not the "(CLEAN PRICE)" one next to it.
export const NSE_DEBT = {
  'Nifty 10 yr Benchmark G-Sec Index': ['NIFTY 10 YR BENCHMARK G-SEC', 'Government Securities', 'Nifty 10 yr Benchmark G-Sec'],
  'NSE short-duration debt index (Liquid or 1D Rate)': ['NIFTY 1D RATE INDEX', 'Money Market', 'Nifty 1D Rate Index'],
};
const names = (xs) => xs.join(', ').replace(/, ([^,]*)$/, ' and $1');

// How a source is downloaded and what you get. `site` is the website: the download list groups by it,
// so a user visits each site once. `terms` is the site's terms of use; `page` is its one download page, where
// there is a single page for every dataset (otherwise each dataset carries its own link), and `pageLabel` that
// page's own heading on the site, so the card, the bookmarklet dialog and the site all name it the same. `steps` and `format`
// are text, or a function of the datasets selected for that source when what to pick depends on them.
// Steps are short on purpose.
export const HOW = {
  nseTri: {
    site: 'NSE Indices',
    page: 'https://www.niftyindices.com/reports/historical-data',
    pageLabel: 'Historical Data Reports',
    terms: 'https://www.niftyindices.com/terms-of-use',
    title: 'NSE Indices: Total Returns Index',
    // Equity total return is its own report; debt is on the default one (walked through live on the site).
    steps: (items) => {
      const eq = items.filter((i) => !NSE_DEBT[i.name]);
      const debt = items.filter((i) => NSE_DEBT[i.name]);
      return [
        ...(eq.length ? [`${names(eq.map((i) => i.asset))}: open the report list at the top (it starts on Historical Index Data, the price series) and choose Total returns Index Values. Then Equity, Broad Market Indices, and the index.`] : []),
        ...debt.map((i) => `${NSE_DEBT[i.name][2]}: stay on Historical Index Data. Then Fixed Income, ${NSE_DEBT[i.name][1]}, and ${NSE_DEBT[i.name][0]}.`),
        'Set From and To. The page allows one year per request (a longer range fetches nothing, with no error), so go one financial year, April to March, at a time.',
        'Press Submit, then csv format above the table. Repeat for each year and import every file as it is.',
      ];
    },
  },
  amfi: {
    site: 'AMFI',
    page: 'https://www.amfiindia.com/net-asset-value/nav-history',
    pageLabel: 'NAV History',
    terms: 'https://www.amfiindia.com/terms-of-use',
    title: 'AMFI: NAV history',
    steps: ['Open NAV History and choose Historical NAV for a period.', 'Pick the fund house, then the scheme (the plan and option named here).', 'Set From and To. The page allows at most 5 years at a time, so a long history is several downloads.', 'Press Go, then download the Excel file and import every part as it is.'],
    format: 'AMFI\'s own Excel: the net asset value, repurchase and sale price and the NAV date, one row per day. Nothing here comes from mfapi.in or any other republisher.',
  },
  nseEtf: {
    site: 'NSE',
    page: 'https://www.nseindia.com/report-detail/eq_security',
    pageLabel: 'Security-wise Archives (Equities)',
    terms: 'https://www.nseindia.com/nse-terms-of-use',
    title: 'NSE: ETF price history',
    steps: ['Open Security-wise Archives (Equities).', 'Choose Security-wise price and volume data, then enter the ETF\'s symbol and the EQ series.', 'Set From and To at most 5 years apart (a longer range fetches nothing, with no error), so a long history is several downloads.', 'Download the file and import every part as it is.'],
    format: 'NSE\'s price and volume table, with a row per trading day. It is the exchange price, not NAV.',
  },
  // Only the two S&P 500 index rows: Yahoo is the one free place with the index itself back to 1927 (price) and
  // 1988 (total return). Yahoo has no download button (exporting history is a paid Yahoo feature), so Xfina offers
  // no bookmark here: it links the index's history page at its full range and reads Yahoo's own column layout.
  yahoo: {
    site: 'Yahoo Finance',
    terms: 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html',
    title: 'Yahoo Finance: S&P 500 index history (no download button)',
    steps: [
      'Open the index\'s history link below: it is already set to the full range, daily.',
      'Yahoo has no download button for free accounts (exporting history is part of its paid plans), so how you get the table into a file is up to you, within Yahoo\'s terms.',
      'Save it as CSV with Yahoo\'s own columns, named after the index, for example SP500TR.csv, and import it.',
    ],
    format: 'Date, Open, High, Low, Close, Adj Close and Volume, one row per day, as Yahoo shows them. For an index Close and Adj Close are the same; the Total Return index already includes dividends.',
  },
  // US-listed funds with no issuer download (QQQ, VOO, SPY, BNDW, SGOL) and US index mutual funds (VFINX and others).
  // Tiingo's free plan gives the full history, with each dividend and split stated (checked 2026-10-02: QQQ within
  // 0.1% and VOO within 0.5% of Yahoo's Adj Close, VFINX's dividends complete from 1980). Its API refuses calls from
  // other websites, so Xfina's bookmark runs on tiingo.com itself, where it may call Tiingo's API with your token.
  tiingo: {
    site: 'Tiingo',
    page: 'https://www.tiingo.com/',
    pageLabel: 'tiingo.com',
    terms: 'https://www.tiingo.com/about/terms',
    title: 'Tiingo: daily prices with dividends and splits',
    steps: [
      'Create a free Tiingo account and copy your API token (signed in: Account, API, Token).',
      'Open tiingo.com and click the Xfina · Tiingo bookmark. It asks for the token once and keeps it in this browser only (on tiingo.com), then saves one CSV per fund.',
      'By hand instead: for each ticker open https://api.tiingo.com/tiingo/daily/<ticker>/prices?startDate=1970-01-01&format=csv&token=<your token>, save the CSV, and name it after the ticker.',
    ],
    format: 'Tiingo\'s CSV: date, close, high, low, open, volume, adjClose, adjHigh, adjLow, adjOpen, adjVolume, divCash, splitFactor. close is the price as traded on the day; divCash is the cash dividend on its ex-date and splitFactor any split, so the total return can be rebuilt and checked (adjClose has both applied). A mutual fund\'s close is its NAV. Tiingo\'s free plan is for personal use.',
  },
  // Exchange-listed gold funds outside the US (London, SIX) and PHYS: no issuer download, but WSJ's historical
  // prices page offers a spreadsheet download for the full range its own date picker allows. Gold pays no
  // dividends, so WSJ's price-only file loses nothing for these.
  wsj: {
    site: 'WSJ',
    page: 'https://www.wsj.com/market-data',
    pageLabel: 'WSJ Markets',
    terms: 'https://www.wsj.com/policy/additional-terms-conditions',
    title: 'WSJ: historical prices',
    steps: [
      'Open any WSJ page (Open WSJ Markets) and click the Xfina · WSJ bookmark. It saves each fund\'s full history, launch to today, named after the fund (for example SGLD_2009-08-19_to_2026-10-02.wsj.csv).',
      'By hand instead: open the fund\'s Historical Prices page (the link on its row), set the date picker from the fund\'s launch to today and download the spreadsheet. The Download link on its row is that same request.',
      'By hand, WSJ names every file HistoricalPrices.csv: rename it after the ticker, for example SGLD.csv, before importing.',
    ],
    format: 'Date, Open, High, Low, Close, Volume, newest first, dates as MM/DD/YY. Price only: no dividends (none of the gold funds taken from here pay any). Exchange holidays can appear as a row with volume 0 and the previous close, which the importer skips.',
  },
  ishares: {
    site: 'iShares',
    terms: 'https://www.blackrock.com/corporate/compliance/terms-and-conditions',
    title: 'iShares: NAV history',
    steps: ['Open the fund page.', 'Press its "Data Download" link.', 'Open the Historical (US funds) or Historical NAVs (UCITS funds) sheet. It is the full daily history from launch.'],
    format: 'An Excel/XML file with a date and the NAV per share, as iShares publishes it. US funds add an Ex-Dividends column (each dividend on its ex-date) and a Distributions sheet, so their total return can be rebuilt; an accumulating fund\'s NAV already includes income.',
  },
  spdrgold: {
    site: 'SPDR Gold Shares',
    terms: 'https://www.spdrgoldshares.com/terms-and-conditions/',
    title: 'SPDR Gold Shares: historical data',
    steps: ['Open the Historical Data page.', 'Download. It is the full daily history from launch.'],
    format: 'An Excel file with a date, the closing price, the NAV per share and ounces of gold per share, as State Street publishes it.',
  },
  msci: {
    site: 'MSCI',
    terms: 'https://www.msci.com/legal/terms-of-use',
    title: 'MSCI: index levels',
    steps: ['Open the index page and its Performance tab.', 'Under Cumulative performance, choose Full history.', 'Press the download icon next to Compare. No account is needed.'],
    format: 'An Excel file with a date and the index level, monthly, as MSCI publishes it: Net Total Return, USD (the page itself never labels this; found in its own chart\'s network request, variant=NETR). Full history on the free page starts 1998-12-31; MSCI\'s own longer history, and other variants (Price, Gross), are licensed.',
  },
  nasdaqIndex: {
    site: 'Nasdaq',
    terms: 'https://www.nasdaq.com/legal',
    title: 'Nasdaq: index history',
    steps: ['Open the index\'s History tab (indexes.nasdaq.com, not the nasdaq.com consumer page, whose own date range is much shorter).', 'Under Performance, press All.', 'Press Download. No account is needed.'],
    format: 'An Excel file with a date and the index level daily, as Nasdaq publishes it, back to the index\'s own start.',
  },
  mcxSpot: {
    site: 'MCX',
    page: 'https://www.mcxindia.com/market-data/spot-market-price',
    pageLabel: 'Spot Market Price',
    terms: 'https://www.mcxindia.com/terms-and-conditions-of-usage-for-website',
    title: 'MCX: Spot Market Price',
    steps: ['Open Spot Market Price and its Archives tab.', 'Set Commodity to GOLD and Location to AHMEDABAD (the only location MCX polls gold at; other cities return nothing).', 'Set the widest date range the site allows (there is no cap: one query returns the full history).', 'Press Show, then press the page\'s own Excel export button.'],
    format: 'Commodity, unit, location, spot price in INR per 10 grams, an up/down mark, and a date and time, as MCX publishes it, wrapped as an .xls file. Prices are polled several times a day, not once (and MCX\'s own Session tag for which poll is inconsistent before recent years), so every reading is kept; pick one reading per day (for example the latest) on import.',
  },
};


// Bring your own data: the format Xfina will read for any dataset, whatever its source. It is Tiingo's daily
// layout, the most complete free one (price as traded, plus each dividend and split), so a Tiingo file needs no
// change and any other source can be mapped onto it. Only date and close are required.
export const CUSTOM_FORMAT = {
  columns: [
    ['date', 'required', 'ISO date, YYYY-MM-DD, one row per trading day'],
    ['close', 'required', 'Closing price (or NAV, or index level) as published on the day'],
    ['open, high, low, volume', 'optional', 'As published on the day'],
    ['divCash', 'optional', 'Cash dividend per unit, on its ex-date; 0 on other days'],
    ['splitFactor', 'optional', 'Split on that day (2 for a 2-for-1 split, 0.5 for a 1-for-2 reverse split); 1 on other days'],
    ['adjClose, adjOpen, adjHigh, adjLow, adjVolume', 'optional', 'The same, adjusted for every dividend and split'],
  ],
  notes: [
    'Header row first, comma-separated, one file per dataset, named after its ticker (for example VOO.csv).',
    'With divCash (and splitFactor where there was a split), the total return is rebuilt from close. Without them, Xfina takes close as already including dividends only for a total-return index or an accumulating fund.',
    'A Tiingo CSV is already in this format; a Yahoo file maps Adj Close onto adjClose.',
  ],
};

const DATE_SOURCE = { direct: 'Direct plans began on 1 Jan 2013', amfi: 'first NAV on AMFI', issuer: 'issuer\'s inception date', manual: 'launch date, not yet verified', publisher: 'publisher\'s start date', nse: 'first row on NSE Indices', yahoo: 'first row on Yahoo Finance', mcx: 'first row on MCX Spot Market Price', nasdaq: 'first row on Nasdaq\'s own index history', tiingo: 'first row on Tiingo', tiingoDiv: 'first Tiingo row with dividends recorded (earlier rows lack them)', wsj: 'first row on WSJ' };
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

// Accumulating vs distributing, shown wherever it is a real, checkable fact -- India included: India doesn't use
// the UCITS words, but the same substance question (does income get paid out, or stay in the fund) has a real
// answer there too, not just a terminology gap.
//   - MF: every fund in this catalogue is the Growth (or old-naming "Cumulative") option -- IDCW/dividend options
//     are filtered out at the source (build-tree.mjs's NOT_GROWTH exclusion) -- so it is always Acc, confirmed
//     structurally by that filter rather than checked fund by fund.
//   - Domestic (or India-listed feeder) ETFs: confirmed live 2026-09-28 for LICNETFGSC ("capitalises gains", pays
//     no dividend) and for the Nifty 1D Rate ETFs (Kotak: "all payouts... reinvested... at the prevailing NAV");
//     none of these trade a separate distributing unit class on NSE (there is no second symbol for one). Gold is
//     excluded -- there is no income to distribute either way.
//   - Non-India ETF: a UCITS/CH fund names its own share class ("... UCITS ETF (Acc)"); one with no such marker
//     is the Distributing share class, the Acc alternative either doesn't exist or wasn't picked. IB01 looked
//     like that case, but isn't: confirmed live on iShares' own page it's Accumulating too, it just doesn't put
//     "(Acc)" in its own title the way its siblings do -- the name here now carries the marker so this check
//     still works without a one-off exception. A native US listing is Distributing by law -- a '40 Act RIC must
//     pay out at least 90% of its net income every year to keep its pass-through tax status, not a per-fund choice.
//
// An index has no share class, but the same Acc/Dist question has a direct analogue in its returnType: any
// total-return variant (plain "Total return", or MSCI's "Net Total Return") reinvests the dividend into the
// index level (Acc's own definition), a Price-only one excludes it entirely (the same practical gap as Dist,
// just not paid to anyone). MCX's spot price is left blank rather than guessed (no return concept at all).
export function distFlag(i) {
  if (i.kind === 'Index') return /total return/i.test(i.returnType || '') ? 'Acc' : i.returnType === 'Price only' ? 'Dist' : null;
  // A US mutual fund pays its income out (the same '40 Act rule as a US ETF, below); Indian funds here are Growth.
  if (i.kind === 'MF') return i.listing === 'usfund' ? 'Dist' : 'Acc';
  if (i.kind !== 'ETF' || i.asset === 'Gold') return null;
  if (i.region === 'india' || i.listing === 'india') return 'Acc';
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
