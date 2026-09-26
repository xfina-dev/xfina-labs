// Catalogue behind the "How to get data" wizard: asset class → region → vehicle (→ US or Irish
// listing for ETFs) → the named datasets and the exact page to download each from.
//
// Links were opened and checked while writing this (NSE Indices, AMFI, MSCI, Nasdaq, NSE quotes,
// iShares fund pages, Yahoo Finance history for US tickers, LBMA, IBJA). Two caveats:
//  - S&P Dow Jones Indices publishes daily index history to subscribers; the entry says so.
//  - The click-by-click steps are written from how these sites usually work and are not yet
//    walked through. Verify them, and record the GIFs, before this ships.
//
// Xfina reads each source's own format, so nothing here asks the user to reshape a file.

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
export const LISTINGS = [
  { id: 'us', title: 'US ETFs', blurb: 'Listed in the US' },
  { id: 'irish', title: 'Irish ETFs', blurb: 'Irish-domiciled UCITS ETFs' },
];

// How a source is downloaded and what you get. Steps are short on purpose.
export const HOW = {
  nseTri: {
    title: 'NSE Indices: Total Returns Index',
    steps: ['Open the Historical Data page.', 'Pick the index, then the Total Returns Index series (not the price series).', 'Set the widest date range the site allows. If it caps the range, download in parts.', 'Download the file and import every part as it is.'],
    format: 'A table with a date and an index value, as NSE publishes it.',
  },
  amfi: {
    title: 'AMFI: NAV history',
    steps: ['Open NAV History.', 'Choose Historical NAV, then the fund house and the scheme.', 'Pick Direct plan, Growth option so distributions stay reinvested.', 'Set the date range and download.'],
    format: 'A date and NAV per line, as AMFI publishes it.',
  },
  nseEtf: {
    title: 'Indian ETF: NAV (preferred) or price',
    steps: ['For NAV, use AMFI NAV History and pick the ETF as the scheme.', 'For exchange price, open the NSE quote page for the symbol and use its historical data.', 'Download the widest range available.'],
    format: 'NAV or price by date, as published.',
  },
  yahoo: {
    title: 'Yahoo Finance: price history',
    steps: ['Open the history page for the ticker.', 'Set the time period to Max and the frequency to Daily.', 'Download. Keep the Adj Close column: it includes dividends.'],
    format: 'A CSV with Date, Open, High, Low, Close, Adj Close and Volume.',
  },
  ishares: {
    title: 'iShares: fund page',
    steps: ['Open the fund page.', 'Find the historical NAV or performance data and choose the widest range.', 'Download it. An accumulating fund\'s NAV already includes income.'],
    format: 'NAV by date, as iShares publishes it.',
  },
  msci: {
    title: 'MSCI: index levels',
    steps: ['Open the index page, then End of Day Index Data.', 'Choose the Net Total Return variant in USD.', 'Set the widest date range and download.'],
    format: 'A date and an index level, as MSCI publishes it.',
  },
  nasdaqIdx: {
    title: 'Nasdaq Indexes: history',
    steps: ['Open the index history page.', 'Set the date range as wide as allowed.', 'Download the levels. This is the total return series, XNDX.'],
    format: 'A date and an index level, as Nasdaq publishes it.',
  },
  spdji: {
    title: 'S&P Dow Jones Indices',
    steps: ['Open the index page and look for its historical data or performance download.', 'Choose the Total Return series.', 'Full daily history is normally for subscribers. If it is not offered to you, use an ETF instead.'],
    format: 'A date and an index level, as S&P publishes it.',
  },
  lbma: {
    title: 'LBMA: Gold Price',
    steps: ['Open Precious Metal Prices.', 'Choose the Gold Price (PM), in USD.', 'Download the full history.'],
    format: 'A date and a USD price, as LBMA publishes it.',
  },
  ibja: {
    title: 'IBJA: domestic gold rates',
    steps: ['Open the IBJA rates page.', 'Use its archive or history option for the date range you need.', 'Download it. Only some ranges may be offered; if so, import each part.'],
    format: 'Daily INR gold rates, as IBJA publishes them.',
  },
};

const L = (label, url) => ({ label, url });
let n = 0;
const d = (o) => ({ id: `d${++n}`, ...o });

const NSE_HIST = 'https://www.niftyindices.com/reports/historical-data';
const AMFI = 'https://www.amfiindia.com/net-asset-value/nav-history';
const nse = (sym) => `https://www.nseindia.com/get-quotes/equity?symbol=${sym}`;
const yahoo = (t) => `https://finance.yahoo.com/quote/${t}/history/`;
const ish = (id, slug) => `https://www.ishares.com/uk/individual/en/products/${id}/${slug}`;
const msciPage = (id) => `https://www.msci.com/indexes/index/${id}`;

const usdEtf = (group, name, code, url, how = 'yahoo', links = null) => d({ group, name, code, how, ccy: 'USD', ret: 'Adjusted price', links: links || [L(`${code} price history`, url)] });
const irishEtf = (group, name, code, url, extra = []) => d({ group, name, code, how: 'ishares', ccy: 'USD', ret: 'Adjusted price', links: [L(`${code} fund page`, url), ...extra] });

const goldUsd = {
  index: [d({ group: 'Gold', name: 'LBMA Gold Price (USD)', how: 'lbma', ccy: 'USD', ret: 'Price only', links: [L('LBMA precious metal prices', 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices')] })],
  etf: {
    us: [usdEtf('Gold', 'SPDR Gold Shares', 'GLD', yahoo('GLD')), usdEtf('Gold', 'iShares Gold Trust', 'IAU', yahoo('IAU'))],
    irish: [irishEtf('Gold', 'iShares Physical Gold ETC', 'SGLN', ish(258441, 'ishares-physical-gold-etc'))],
  },
  mf: [],
  note: { mf: 'There is no mutual fund route for USD gold. Use an ETF.' },
};

// catalogue[class][region] = { index: [...], etf: { us: [...], irish: [...] } | [...], mf: [...], note }
export const catalogue = {
  equity: {
    india: {
      index: ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'].map((x) => d({ group: x, name: `${x} TRI`, how: 'nseTri', ccy: 'INR', ret: 'Total return', links: [L('NSE Indices historical data', NSE_HIST)] })),
      etf: [
        d({ group: 'Nifty 50', name: 'Nippon India ETF Nifty 50 BeES', code: 'NIFTYBEES', how: 'nseEtf', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV on AMFI', AMFI), L('NIFTYBEES on NSE', nse('NIFTYBEES'))] }),
        d({ group: 'Nifty Next 50', name: 'Nippon India ETF Nifty Next 50 Junior BeES', code: 'JUNIORBEES', how: 'nseEtf', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV on AMFI', AMFI), L('JUNIORBEES on NSE', nse('JUNIORBEES'))] }),
      ],
      mf: ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'].map((x) => d({ group: x, name: `A ${x} index fund (Direct, Growth)`, how: 'amfi', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV history on AMFI', AMFI)] })),
    },
    us: {
      index: [
        d({ group: 'S&P 500', name: 'S&P 500 Total Return', how: 'spdji', ccy: 'USD', ret: 'Total return', links: [L('S&P 500 on S&P Dow Jones Indices', 'https://www.spglobal.com/spdji/en/indices/equity/sp-500/')] }),
        d({ group: 'Nasdaq 100', name: 'Nasdaq-100 Total Return (XNDX)', how: 'nasdaqIdx', ccy: 'USD', ret: 'Total return', links: [L('XNDX history', 'https://indexes.nasdaqomx.com/Index/History/XNDX')] }),
      ],
      etf: {
        us: [usdEtf('S&P 500', 'SPDR S&P 500 ETF Trust', 'SPY', yahoo('SPY')), usdEtf('S&P 500', 'Vanguard S&P 500 ETF', 'VOO', yahoo('VOO')), usdEtf('S&P 500', 'iShares Core S&P 500 ETF', 'IVV', yahoo('IVV')), usdEtf('Nasdaq 100', 'Invesco QQQ Trust', 'QQQ', yahoo('QQQ'))],
        irish: [irishEtf('S&P 500', 'iShares Core S&P 500 UCITS ETF (Acc)', 'CSPX', ish(253743, 'ishares-core-sp-500-ucits-etf')), d({ group: 'S&P 500', name: 'Vanguard S&P 500 UCITS ETF (Acc)', code: 'VUAA', how: 'yahoo', ccy: 'USD', ret: 'Adjusted price', links: [L('VUAA price history', yahoo('VUAA.L'))] }), irishEtf('Nasdaq 100', 'iShares Nasdaq 100 UCITS ETF (Acc)', 'CNDX', ish(253741, 'ishares-nasdaq-100-ucits-etf'))],
      },
      mf: ['S&P 500', 'Nasdaq 100'].map((x) => d({ group: x, name: `An Indian fund tracking the ${x} (INR NAV)`, how: 'amfi', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV history on AMFI', AMFI)] })),
    },
    global: {
      index: [['MSCI ACWI', 892400], ['MSCI World', 990100], ['MSCI Emerging Markets', 891800]].map(([x, id]) => d({ group: x, name: `${x} Net Total Return`, how: 'msci', ccy: 'USD', ret: 'Total return', links: [L(`${x} on MSCI`, msciPage(id))] })),
      etf: {
        us: [usdEtf('MSCI ACWI', 'iShares MSCI ACWI ETF', 'ACWI', yahoo('ACWI')), usdEtf('MSCI Emerging Markets', 'iShares MSCI Emerging Markets ETF', 'EEM', yahoo('EEM'))],
        irish: [irishEtf('MSCI ACWI', 'iShares MSCI ACWI UCITS ETF (Acc)', 'SSAC', ish(251850, 'ishares-msci-acwi-ucits-etf')), irishEtf('MSCI World', 'iShares Core MSCI World UCITS ETF (Acc)', 'SWDA', ish(251882, 'ishares-msci-world-ucits-etf-acc-fund'), [L('IWDA price history', yahoo('IWDA.L'))]), irishEtf('MSCI Emerging Markets', 'iShares Core MSCI EM IMI UCITS ETF (Acc)', 'EIMI', ish(264659, 'ishares-core-msci-em-imi-ucits-etf'))],
      },
      mf: [],
      note: { mf: 'Indian funds that invest abroad are covered under US. For MSCI markets, use an ETF.' },
    },
  },
  gold: {
    india: {
      index: [d({ group: 'Gold', name: 'Domestic gold rate (INR)', how: 'ibja', ccy: 'INR', ret: 'Price only', links: [L('IBJA rates', 'https://ibjarates.com/')] })],
      etf: [d({ group: 'Gold', name: 'Nippon India ETF Gold BeES', code: 'GOLDBEES', how: 'nseEtf', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV on AMFI', AMFI), L('GOLDBEES on NSE', nse('GOLDBEES'))] })],
      mf: [d({ group: 'Gold', name: 'A gold fund of funds (Direct, Growth)', how: 'amfi', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV history on AMFI', AMFI)] })],
    },
    us: goldUsd,
    global: { ...goldUsd, note: { ...goldUsd.note, index: 'Gold is priced world-wide in USD, so Global and US use the same datasets.' } },
  },
  debt: {
    india: {
      index: [
        d({ group: 'Short duration', name: 'NSE short-duration debt index (Liquid or 1D Rate)', how: 'nseTri', ccy: 'INR', ret: 'Total return', links: [L('NSE Indices historical data', NSE_HIST)] }),
        d({ group: 'Long duration', name: 'Nifty 10 yr Benchmark G-Sec Index', how: 'nseTri', ccy: 'INR', ret: 'Total return', links: [L('NSE Indices historical data', NSE_HIST)] }),
      ],
      etf: [
        d({ group: 'Short duration', name: 'Nippon India ETF Liquid BeES', code: 'LIQUIDBEES', how: 'nseEtf', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV on AMFI', AMFI), L('LIQUIDBEES on NSE', nse('LIQUIDBEES'))] }),
        d({ group: 'Long duration', name: 'A long-term gilt ETF', how: 'nseEtf', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV on AMFI', AMFI)] }),
      ],
      mf: [
        d({ group: 'Short duration', name: 'A liquid or money-market fund (Direct, Growth)', how: 'amfi', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV history on AMFI', AMFI)] }),
        d({ group: 'Long duration', name: 'A gilt fund with 10-year constant duration (Direct, Growth)', how: 'amfi', ccy: 'INR', ret: 'Adjusted price', links: [L('NAV history on AMFI', AMFI)] }),
      ],
    },
    us: {
      index: [],
      etf: {
        us: [usdEtf('Short duration', 'iShares 0-3 Month Treasury Bond ETF', 'SGOV', yahoo('SGOV')), usdEtf('Short duration', 'SPDR Bloomberg 1-3 Month T-Bill ETF', 'BIL', yahoo('BIL')), usdEtf('Long duration', 'iShares 20+ Year Treasury Bond ETF', 'TLT', yahoo('TLT'))],
        irish: [irishEtf('Short duration', 'iShares $ Treasury Bond 0-1yr UCITS ETF', 'IB01', ish(307243, 'ishares-usd-treasury-bond-01yr-ucits-etf'), [L('IB01 price history', yahoo('IB01.L'))]), irishEtf('Long duration', 'iShares $ Treasury Bond 20+yr UCITS ETF', 'IDTL', ish(272124, 'ishares-usd-treasury-bond-20-yr-ucits-etf'))],
      },
      mf: [],
      note: { index: 'Treasury index history is not freely published. Use an ETF.', mf: 'There is no mutual fund route for US Treasuries. Use an ETF.' },
    },
    global: {
      index: [],
      etf: {
        us: [usdEtf('Aggregate', 'Vanguard Total World Bond ETF', 'BNDW', yahoo('BNDW'))],
        irish: [irishEtf('Aggregate', 'iShares Core Global Aggregate Bond UCITS ETF', 'AGGG', ish(291773, 'ishares-core-global-aggregate-bond-ucits-etf'))],
      },
      mf: [],
      note: { index: 'Global bond index history is not freely published. Use an ETF.', mf: 'There is no mutual fund route here. Use an ETF.' },
    },
  },
};

export const findDataset = (id) => {
  for (const c of Object.values(catalogue)) for (const r of Object.values(c)) {
    for (const v of [r.index, r.mf, ...(Array.isArray(r.etf) ? [r.etf] : Object.values(r.etf || {}))]) {
      const hit = (v || []).find((x) => x.id === id);
      if (hit) return hit;
    }
  }
  return null;
};

// What a step of the wizard offers, given the choices so far.
export function datasetsFor(cls, region, vehicle, listing) {
  const r = catalogue[cls]?.[region];
  if (!r) return { items: [], note: '' };
  if (vehicle === 'etf') {
    const etf = r.etf;
    const items = Array.isArray(etf) ? etf : etf?.[listing] || [];
    return { items, note: r.note?.etf || '' };
  }
  return { items: r[vehicle] || [], note: r.note?.[vehicle] || '' };
}

export const hasListings = (cls, region) => !Array.isArray(catalogue[cls]?.[region]?.etf);
