// Where to download each series, and what to do with it. Placeholder content for the mock:
// verify every step and link against the provider before this ships. `gif` is a file under
// /public/help/ once a recording exists; until then the page shows a placeholder.
export const sources = {
  nse: {
    title: 'NSE Indices: Total Return Index',
    site: 'niftyindices.com', url: 'https://www.niftyindices.com/reports/historical-data',
    steps: [
      'Open the Historical Data page on NSE Indices.',
      'Choose the index and its Total Return series, not the price series.',
      'Set the widest date range allowed. If the site caps the range, download in chunks and paste them into one file.',
      'Save as CSV. Keep only the date and the index value.',
    ],
    returnType: 'Total return', currency: 'INR', gif: null,
  },
  indexUs: {
    title: 'US index provider: Total Return index',
    site: 'The index provider (S&P Dow Jones Indices, Nasdaq)', url: null,
    steps: [
      'Open the index page on the provider\'s site and find its historical data or performance download.',
      'Pick the Total Return variant. The price index leaves out dividends.',
      'Download the daily series as CSV.',
      'Keep the date and the index level. Set the currency to USD when you import.',
    ],
    returnType: 'Total return', currency: 'USD', gif: null,
  },
  msci: {
    title: 'MSCI: index levels',
    site: 'msci.com', url: 'https://www.msci.com/end-of-day-data-search',
    steps: [
      'Open MSCI end-of-day data and search for the index.',
      'Choose the Net (or Gross) Total Return variant, in USD.',
      'Set the date range and download the levels.',
      'Keep the date and the level.',
    ],
    returnType: 'Total return', currency: 'USD', gif: null,
  },
  etf: {
    title: 'ETF: NAV or price history',
    site: 'The ETF issuer or the exchange it is listed on', url: null,
    steps: [
      'Open the fund page of the ETF you want to model.',
      'Find the NAV history or price history download.',
      'For an accumulating share class the price already includes distributions. For a distributing class, use adjusted close.',
      'Save as CSV with the date and NAV (or adjusted close). You will confirm the currency after import.',
    ],
    returnType: 'Adjusted price', currency: 'Fund currency', gif: null,
  },
  amfi: {
    title: 'AMFI: mutual fund NAV history',
    site: 'amfiindia.com', url: 'https://www.amfiindia.com/nav-history-download',
    steps: [
      'Open NAV History on AMFI.',
      'Select the fund house, the scheme and the date range.',
      'Choose the Direct, Growth plan so distributions stay reinvested.',
      'Download and keep the date and Net Asset Value columns. Convert dates to YYYY-MM-DD.',
    ],
    returnType: 'Adjusted price', currency: 'INR', gif: null,
  },
};

const IN = (label, type, src) => ({ type, label, src });

export const regions = [
  {
    id: 'india', title: 'India', note: 'INR assets. Prefer the Total Return index; use an ETF or fund to model what you could actually have held.',
    assets: [
      { name: 'Nifty 50', options: [IN('Nifty 50 TRI', 'Index', 'nse'), IN('An NSE-listed Nifty 50 ETF', 'ETF', 'etf'), IN('A Nifty 50 index fund (Direct, Growth)', 'MF', 'amfi')] },
      { name: 'Nifty Next 50', options: [IN('Nifty Next 50 TRI', 'Index', 'nse'), IN('A Nifty Next 50 ETF', 'ETF', 'etf'), IN('A Nifty Next 50 index fund', 'MF', 'amfi')] },
      { name: 'Nifty Midcap 150', options: [IN('Nifty Midcap 150 TRI', 'Index', 'nse'), IN('A Midcap 150 index fund', 'MF', 'amfi')] },
      { name: 'Nifty Smallcap 250', options: [IN('Nifty Smallcap 250 TRI', 'Index', 'nse'), IN('A Smallcap 250 index fund', 'MF', 'amfi')] },
      { name: 'Gold', options: [IN('An NSE-listed gold ETF', 'ETF', 'etf'), IN('A gold fund of funds', 'MF', 'amfi')] },
      { name: 'Debt (short duration)', options: [IN('A liquid or money-market fund', 'MF', 'amfi')] },
    ],
  },
  {
    id: 'us', title: 'US', note: 'USD assets. US-listed ETFs and Irish UCITS ETFs are both fine; the currency is set when you import.',
    assets: [
      { name: 'S&P 500', options: [IN('S&P 500 Total Return index', 'Index', 'indexUs'), IN('A US-listed or Irish UCITS S&P 500 ETF', 'ETF', 'etf')] },
      { name: 'Nasdaq 100', options: [IN('Nasdaq 100 Total Return index', 'Index', 'indexUs'), IN('A US-listed or Irish UCITS Nasdaq 100 ETF', 'ETF', 'etf')] },
      { name: 'Debt (0–1 year Treasury)', options: [IN('A 0–1 year Treasury or T-bill ETF', 'ETF', 'etf')] },
      { name: 'Gold', options: [IN('A USD gold ETF or ETC', 'ETF', 'etf')] },
    ],
  },
  {
    id: 'global', title: 'Global', note: 'USD assets from MSCI, or the ETFs that track them.',
    assets: [
      { name: 'MSCI ACWI', options: [IN('MSCI ACWI Net Total Return', 'Index', 'msci'), IN('An ACWI ETF', 'ETF', 'etf')] },
      { name: 'MSCI World', options: [IN('MSCI World Net Total Return', 'Index', 'msci'), IN('A World ETF', 'ETF', 'etf')] },
      { name: 'MSCI Emerging Markets', options: [IN('MSCI Emerging Markets Net Total Return', 'Index', 'msci'), IN('An Emerging Markets ETF', 'ETF', 'etf')] },
    ],
  },
];

// Nothing to download: Xfina supplies these and fills each one from several sources.
export const provided = [
  { name: 'USD/INR', sources: ['BIS for the years before 2020-01-04', 'SBI forex card TT rates from 2020-01-04'], use: 'Converts every USD series to INR.' },
  { name: 'Inflation', sources: ['World Bank CPI before 2013', 'MoSPI CPI from 2013-01'], use: 'Turns nominal results into today\'s money.' },
];
