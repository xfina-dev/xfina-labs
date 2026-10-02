// Builds src/portfolio-engine/tree.json: the fully qualified tree behind the data guide.
//
//   Asset class → Region → Vehicle (→ Listing, for US/Global ETFs) → Asset → instruments
//
// Scope: equity is index funds and index ETFs only; gold, liquid and gilt are included as well. Each
// leaf keeps its three oldest instruments, so the guide can offer the three with the longest
// history. "Oldest" is a measured fact, not a claim:
//   - Indian funds and ETFs: the first NAV date and last NAV date from mfapi.in, which republishes
//     AMFI's NAV history. Schemes whose last NAV is old (closed or merged) are dropped.
//   - iShares ETFs: the inception date printed on the fund's own page.
//   - Everything else (SPY, QQQ, GLD, ...): a public launch date typed in below, marked
//     dateSource "manual" so it can be told apart and checked.
//
// Run: node scripts/build-tree.mjs     (needs network; takes about a minute)

import { writeFile } from 'node:fs/promises';

const OUT = new URL('../src/portfolio-engine/tree.json', import.meta.url);
const KEEP = 3;            // instruments kept per leaf: the three with the longest history
const STALE_DAYS = 21;     // a scheme with no NAV in this long is treated as closed
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36';

const AMFI = 'https://www.amfiindia.com/net-asset-value/nav-history';
const NSE_HIST = 'https://www.niftyindices.com/reports/historical-data';
const L = (label, url) => ({ label, url });
const iso = (dmy) => dmy.split('-').reverse().join('-');
const day = (d) => new Date(d).getTime() / 86400000;
const TODAY = day(new Date().toISOString().slice(0, 10));

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
async function getJson(url, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (r.ok) return await r.json(); } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400 * (t + 1)));
  }
  return null;
}

// ---------------------------------------------------------------- India, from mfapi.in
const NOISE = /equal|value|arbitrage|momentum|quality|alpha|low vol|shariah|bond|sdl|g-?sec|cpse|top\s*(10|20|50)|leverag|\bnext\b|multi|smart|dividend|esg|sector|bank|it\b|pharma|fmcg|auto|midcap 50\b/i;
const NOT_GROWTH = /idcw|dividend|payout|bonus|withdrawal/i;
const FOF = /fof|fund of fund|savings fund/i;
// A handful of scheme pairs whose own AMFI name never says "Regular"/"Direct" at all -- both plans share one
// literal scheme name -- so the usual /direct/i.test(schemeName) can't tell them apart by text. Found live
// 2026-09-28 while checking that Nasdaq 100's Direct picks are the same funds as Regular's: Motilal Oswal
// Nasdaq 100 FoF (145551/145552) and Navi NASDAQ100 FoF (149910/149911). Told apart by comparing NAV on the
// same day for the same launch date -- Direct's lower fee compounds to a higher NAV -- confirmed 145552 and
// 149910 are the Direct plans (higher NAV of their pair); this also corrects Navi, whose 149910 was previously
// shown as Regular when it is actually the Direct one.
const FORCE_DIRECT = new Set([145552, 149910]);
// Several Regular-plan groups share an exact date tie, not just a close one: AMFI's own NAV archive has a hard
// floor around 2006-04-02/03 for nearly every AMC's index/liquid/gilt fund, whatever the fund's real launch date
// (checked directly against mfapi.in with KEEP temporarily raised to see past the usual top-3 cut, 2026-09-28).
// Whoever's scheme name sorts first alphabetically was winning that tie by default, which has nothing to do with
// which fund anyone would actually want to compare. Broken here by AUM instead -- a snapshot from indmoney.com's
// comparison tables (2026-09-27/28, cross-checked against a second fetch for the closest pair), in crores, for
// just the scheme codes actually tied in a leaf. There is no free, scriptable scheme-wise AUM feed to check this
// on every future run; if a re-run's picks land on a fund not listed here, it likely isn't tied on date with
// anything, so this table simply won't apply -- no silent effect outside the ties it was measured for.
const AUM_CR = {
  // Nifty 50 Regular, tied 2006-04-03: UTI, HDFC, Aditya Birla Sun Life, Tata, Franklin, LIC (ICICI is a day
  // earlier and unaffected).
  100822: 29485, 101525: 23784, 101314: 1488, 101659: 1707, 100484: 715, 101201: 366,
  // Short duration (Liquid) Regular, tied 2006-04-01: UTI, Baroda BNP Paribas -- then tied 2006-04-02: HDFC,
  // Aditya Birla Sun Life, ICICI Prudential, Kotak, DSP, JM.
  102012: 29218, 101408: 13194, 100868: 71323, 100047: 69830, 103340: 62798, 100835: 49073, 103347: 27920, 100234: 1743,
  // Long duration (Gilt) Regular, tied 2006-04-02: ICICI Prudential, Kotak -- then tied 2006-04-03: HDFC, Aditya
  // Birla Sun Life, DSP, Baroda BNP Paribas, Franklin, Canara Robeco.
  100369: 7950, 100265: 2108, 101083: 2017, 100058: 1238, 100084: 1213, 101187: 575, 100493: 147, 100597: 121,
};
const isEtf = (n) => /\betf\b|bees|exchange traded/i.test(n) && !FOF.test(n);

const INDIA = [
  { cls: 'equity', asset: 'Nifty 50', re: /nifty\s*-?50\b/i, no: NOISE },
  { cls: 'equity', asset: 'Nifty Next 50', re: /nifty\s*next\s*50/i, no: /bond|sdl|g-?sec|momentum|quality|alpha|low vol|value|equal/i },
  { cls: 'equity', asset: 'Nifty Midcap 150', re: /nifty\s*midcap\s*150/i, no: /momentum|quality|alpha|low vol|value|equal|multi/i },
  { cls: 'equity', asset: 'Nifty Smallcap 250', re: /nifty\s*smallcap\s*250/i, no: /momentum|quality|alpha|low vol|value|equal|multi/i },
  { cls: 'gold', asset: 'Gold', re: /gold/i, no: /silver|multi|equity|mining/i },
  { cls: 'debt', asset: 'Short duration', re: /liquid|1d\s*rate/i, no: /overnight|cash plus|equity|hybrid|arbitrage|children|retire|discontinued|institutional|retail|provident|\bplus\b/i },
  { cls: 'debt', asset: 'Long duration', re: /gilt|10 ?y(ea)?r|constant maturity|long term gilt|g-?sec/i, no: /equity|hybrid|arbitrage|children|retire|sdl|target|bond plus|corporate|psu|cpse|provident|\bpf\b|trust|discontinued|institutional|retail|gilt plus|liquid plan/i },
];
// Indian funds that track US indices (the "Indian fund tracking the S&P 500" list).
const FEEDERS = [
  { asset: 'S&P 500', feeder: true, re: /s&p\s*500/i, no: /cnx|top\s*50|equal|momentum|quality|low vol|esg/i },
  { asset: 'Nasdaq 100', feeder: true, re: /nasdaq\s*-?100/i, no: /equal|momentum|quality|low vol|esg/i },
];

async function loadSchemes() {
  const all = await getJson('https://api.mfapi.in/mf');
  if (!all) throw new Error('could not read the mfapi scheme list');
  return all;
}
const baseKey = (n) => n.toLowerCase().replace(/regular plan|direct plan|\bplan\b|growth option|growth|option|direct|regular|[-–()]/g, ' ').replace(/\s+/g, ' ').trim();
const planOf = (n) => (/direct/i.test(n) ? 'Direct' : /regular/i.test(n) ? 'Regular' : '');

// Fetch each candidate's NAV history once, keep the live ones, oldest first.
async function measure(cands) {
  const rows = await pool(cands, 8, async (c) => {
    const j = await getJson(`https://api.mfapi.in/mf/${c.schemeCode}`);
    if (!j?.data?.length) return null;
    const firstNav = iso(j.data.at(-1).date), last = iso(j.data[0].date);
    if (TODAY - day(last) > STALE_DAYS) return null;
    // Direct plans only exist from 2013-01-01. AMFI sometimes carries an older plan's NAVs under the Direct code, so a
    // Direct plan never starts before that -- but the underlying fund's true first NAV is kept too (trueFirst), so
    // oldestFirst can still rank same-clamped-date Direct funds by which one's fund is actually older, instead of
    // falling back to alphabetical order (checked live 2026-09-28: without this, three Direct liquid funds all shown
    // as "2013-01-01" were picked as Aditya Birla < Axis < Bandhan -- alphabetical, not oldest).
    //
    // Quantum Mutual Fund is the one real exception to the clamp itself, not just its ranking: it was founded in
    // December 2005 specifically as a direct-to-investor fund house, zero distributor commission from day one --
    // confirmed live 2026-09-28, "India's first direct-to-investor mutual fund," years before SEBI's 2013 mandate
    // created "Direct Plan" as a concept everyone else uses. So its pre-2013 NAVs under the Direct code are a real
    // series an investor could actually have bought at, not an artifact of AMFI's 2013 data backfill the way it is
    // for every other AMC. Its Direct plans are exempt from the clamp; the true date is kept as dateSource 'amfi'.
    const clamped = /direct/i.test(c.schemeName) && firstNav < DIRECT_START && !/^quantum\b/i.test(c.schemeName);
    return { c, meta: j.meta, first: clamped ? DIRECT_START : firstNav, trueFirst: firstNav, clamped, last, n: j.data.length };
  });
  return rows.filter(Boolean);
}
const DIRECT_START = '2013-01-01';
function toInstrument(r, vehicle) {
  const name = r.c.schemeName.replace(/\s+/g, ' ').trim();
  return {
    id: `mf${r.c.schemeCode}`, name, code: String(r.c.schemeCode), plan: (FORCE_DIRECT.has(r.c.schemeCode) ? 'Direct' : planOf(name)) || undefined,
    inception: r.first, lastNav: r.last, observations: r.n, dateSource: r.clamped ? 'direct' : 'amfi',
    ccy: 'INR', returnType: 'NAV', how: 'amfi', kind: vehicle === 'etf' ? 'ETF' : 'MF',
    links: [L('AMFI NAV history', AMFI)],
  };
}
function oldestFirst(rows, vehicle) {
  // One row per fund: the same fund appears as Regular and Direct, and the older plan has the longer history.
  const best = new Map();
  for (const r of rows) { const k = baseKey(r.c.schemeName); const cur = best.get(k); if (!cur || r.trueFirst < cur.trueFirst) best.set(k, r); }
  // Sort by the displayed (possibly clamped) date first, then by the fund's true underlying date -- so among
  // several Direct funds all clamped to the same 2013-01-01 start, the one whose fund is actually older wins the
  // KEEP cut, not whichever scheme name sorts first alphabetically.
  return [...best.values()].sort((a, b) => a.first.localeCompare(b.first) || a.trueFirst.localeCompare(b.trueFirst) || a.c.schemeName.localeCompare(b.c.schemeName)).slice(0, KEEP).map((r) => toInstrument(r, vehicle));
}

// ---------------------------------------------------------------- India ETFs, from NSE
// Indian ETFs trade on NSE under a ticker, so the list comes from NSE (https://www.nseindia.com/api/etf:
// symbol and underlying index for every listed ETF). NSE does not serve a listing date to scripts (its
// per-symbol endpoints refuse them), so dates are typed here for the funds where the symbol and the
// launch are both certain, and every other ETF is listed without one, after the dated ones.
//   'manual' = a public launch date typed in, not yet verified.
//   'amfi'   = the first NAV AMFI holds for the same fund (measured through mfapi.in earlier).
const NSE_ETF = {
  NIFTYBEES: ['Nippon India ETF Nifty 50 BeES', '2002-01-08', 'manual'],
  QNIFTY: ['Quantum Nifty 50 ETF', '2008-07-17', 'amfi'],
  MOM50: ['Motilal Oswal Nifty 50 ETF', '2010-07-30', 'amfi'],
  JUNIORBEES: ['Nippon India ETF Nifty Next 50 Junior BeES', '2003-02-21', 'manual'],
  NEXT50IETF: ['ICICI Prudential Nifty Next 50 ETF', '2018-08-24', 'amfi'],
  SETFNN50: ['SBI Nifty Next 50 ETF', '2015-03-25', 'amfi'],
  MID150BEES: ['Nippon India ETF Nifty Midcap 150', '2019-02-01', 'amfi'],
  MIDCAPIETF: ['ICICI Prudential Nifty Midcap 150 ETF', '2020-01-27', 'amfi'],
  MIDCAPETF: ['Mirae Asset Nifty Midcap 150 ETF', '2022-03-10', 'amfi'],
  HDFCSML250: ['HDFC Nifty Smallcap 250 ETF', '2023-02-15', 'amfi'],
  MOSMALL250: ['Motilal Oswal Nifty Smallcap 250 ETF', '2024-03-21', 'amfi'],
  SMALL250: ['Mirae Asset Nifty Smallcap 250 ETF', '2025-11-10', 'amfi'],
  GOLDBEES: ['Nippon India ETF Gold BeES', '2007-03-08', 'manual'],
  QGOLDHALF: ['Quantum Gold ETF', '2008-02-27', 'amfi'],
  HDFCGOLD: ['HDFC Gold ETF', '2010-08-16', 'amfi'],
  // No LIQUIDBEES: it keeps a constant ~Rs 1000 unit price and pays returns as bonus units credited to the demat
  // account (confirmed live 2026-09-28), so its NSE market price alone shows ~0% return over 20+ years -- a real
  // trap for anyone taking "Market price" at face value. The reformed "Nifty 1D Rate" ETFs below have a genuinely
  // growing NAV (confirmed for LIQUID1: "All payouts... reinvested... at the then prevailing NAV") and cover the
  // same asset (overnight/liquid cash) without it.
  LIQUID1: ['Kotak Nifty 1D Rate Liquid ETF', '2023-01-31', 'amfi'],
  LIQUIDCASE: ['Zerodha Nifty 1D Rate Liquid ETF', '2024-01-23', 'amfi'],
  LIQUIDBETF: ['Bajaj Finserv Nifty 1D Rate Liquid ETF', '2024-06-03', 'amfi'],
  LICNETFGSC: ['LIC MF Nifty 8-13 yr G-Sec ETF', '2014-12-26', 'amfi'],
  SETF10GILT: ['SBI Nifty 10 yr Benchmark G-Sec ETF', '2016-06-16', 'amfi'],
  LTGILTBEES: ['Nippon India ETF Nifty 8-13 yr G-Sec Long Term Gilt', '2016-07-07', 'amfi'],
  LTGILTCASE: ['Zerodha Nifty 8-13 Yr G-Sec ETF', '2025-08-20', 'amfi'],
};
// Which NSE ETFs belong to which asset, by the underlying NSE prints for each.
const NSE_ASSETS = [
  { cls: 'equity', asset: 'Nifty 50', re: /^nifty 50$/i },
  { cls: 'equity', asset: 'Nifty Next 50', re: /next 50/i, no: /sensex|bse|momentum|quality|alpha|low vol/i, also: ['JUNIORBEES'] },
  { cls: 'equity', asset: 'Nifty Midcap 150', re: /midcap ?150/i, no: /momentum|quality|bse|alpha|low vol/i },
  { cls: 'equity', asset: 'Nifty Smallcap 250', re: /smallcap ?250/i, no: /momentum|quality|bse|alpha|low vol/i },
  { cls: 'gold', asset: 'Gold', re: /^gold$/i },
  { cls: 'debt', asset: 'Short duration', re: /nifty ?1d rate/i },
  { cls: 'debt', asset: 'Long duration', re: /8-13|10 yr/i, no: /5 yr|hybrid|momentum/i },
];
async function indiaEtfs() {
  const j = await getJson('https://www.nseindia.com/api/etf');
  if (!j?.data?.length) throw new Error('could not read the NSE ETF list (https://www.nseindia.com/api/etf)');
  const rows = j.data;
  console.log(`  ${rows.length} ETFs listed on NSE`);
  const NSE_REPORT = 'https://www.nseindia.com/report-detail/eq_security';
  for (const a of NSE_ASSETS) {
    const hit = rows.filter((r) => (a.re.test(r.assets || '') && !(a.no && a.no.test(r.assets || ''))) || (a.also || []).includes(r.symbol));
    const insts = hit.map((r) => {
      const t = NSE_ETF[r.symbol];
      return {
        id: `nse-${r.symbol.toLowerCase()}`, name: t ? t[0] : r.symbol, code: r.symbol, inception: t ? t[1] : null, dateSource: t ? t[2] : null,
        turnover: Number(r.trdVal) || 0, ccy: 'INR', returnType: 'Market price', how: 'nseEtf', kind: 'ETF',
        links: [L('NSE historical price data', NSE_REPORT), L(`${r.symbol} on NSE`, `https://www.nseindia.com/get-quotes/equity?symbol=${r.symbol}`)],
      };
    });
    // Dated ones first, oldest first; the rest by what trades most, so an undated leaf still lists the liquid funds.
    insts.sort((x, y) => (x.inception && y.inception ? x.inception.localeCompare(y.inception) : x.inception ? -1 : y.inception ? 1 : y.turnover - x.turnover));
    node(a.cls, 'india', 'etf', null, a.asset).instruments.push(...insts.slice(0, KEEP));
    console.log(`  NSE ${a.cls}/${a.asset}: ${hit.length} ETFs (${insts.filter((i) => i.inception).length} dated)`);
  }
}

// ---------------------------------------------------------------- non-India, curated
async function isharesInception(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const t = await r.text();
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const fmt = (y, mon, d) => `${y}-${String(MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // UK pages print 19/May/2010; US pages carry structured data: "Fund Inception","value":"Mar 26, 2008".
    let m = t.match(/inceptionDate-data">(\d{1,2})\/([A-Za-z]+)\/(\d{4})/) || t.match(/launchDate-data">(\d{1,2})\/([A-Za-z]+)\/(\d{4})/);
    if (m) return fmt(m[3], m[2], m[1]);
    m = t.match(/"Fund Inception","value":"([A-Za-z]+) (\d{1,2}), (\d{4})"/);
    if (m) return fmt(m[3], m[1], m[2]);
    // CH pages carry neither: read the first point of the NAV performance chart's own data series instead
    // (var navData = [{x:Date.UTC(2009,9,5),...}, the earliest date the fund itself has a NAV for).
    m = t.match(/navData\s*=\s*\[\{x:Date\.UTC\((\d{4}),(\d{1,2}),(\d{1,2})\)/);
    return m ? `${m[1]}-${String(+m[2] + 1).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null;
  } catch { return null; }
}
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const epoch = (d) => Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 1000);
// Yahoo's own history page at its full daily range (the address its date picker produces). Only the two S&P 500
// index rows use Yahoo, which has no download button; no bookmark is offered for it.
const yahooRange = (sym, since) => `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}/history/?period1=${epoch(since)}&period2=${epoch(TODAY_ISO) + 86400}&frequency=1d`;
// Tiingo: the ticker's page there. Data comes from Tiingo's API with the user's own free token, through the Xfina
// bookmark on tiingo.com (Tiingo's API refuses calls from other websites).
const tiingo = (t) => `https://www.tiingo.com/${t.toLowerCase()}/overview`;
// WSJ: the fund's historical prices page, and the spreadsheet download that page's own date picker produces for
// launch-to-today (the range it allows; confirmed for QQQ from 1991 on 2026-09-30). `path` is WSJ's own, e.g.
// etf/UK/XLON/SGLD for a London listing.
const mdy = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
const wsjPage = (path) => `https://www.wsj.com/market-data/quotes/${path}/historical-prices`;
const wsjDownload = (path, since) => {
  const days = Math.ceil((epoch(TODAY_ISO) - epoch(since)) / 86400) + 1;
  return `${wsjPage(path)}/download?MOD_VIEW=page&num_rows=${days}&range_days=${days}&startDate=${mdy(since)}&endDate=${mdy(TODAY_ISO)}`;
};
// Nasdaq's own index-history export, direct and unauthenticated (confirmed live 2026-09-28, a real .xlsx). `since`
// is the index's own "All" start date; the end date is always today, so this URL only ever needs regenerating
// when the script itself is re-run (the guide.js UI builds its own current end date the same way for other sources).
const nasdaqExport = (symbol, since) => `https://indexes.nasdaq.com/Index/ExportHistory/${symbol}?startDate=${since}T00:00:00.000&endDate=${new Date().toISOString().slice(0, 10)}T00:00:00.000&timeOfDay=EOD`;
const ishUk = (id, slug) => `https://www.ishares.com/uk/individual/en/products/${id}/${slug}`;
const ishUs = (id, slug) => `https://www.ishares.com/us/products/${id}/${slug}`;
const ishCh = (id, slug) => `https://www.ishares.com/ch/individual/en/products/${id}/${slug}`;
// iShares' own "Data Download" file (Excel/XML), the same one the fund page's Data Download link gives: a Historical
// (US) or Historical NAVs (UK) sheet with one row per day back to the fund's start. Confirmed for IVV, SWDA, and the
// rest of the Irish-domiciled set (2026-09-27); the US and UK sites use different API hosts.
const ishNavUs = (id) => `https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api/v1/get-fund-document?appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=us-ishares&locale=en_US&portfolioId=${id}&component=fundDownload&userType=individual`;
const ishNavUk = (id) => `https://www.blackrock.com/varnish-api/uk-retail01-product-data/product-data/api/v1/get-fund-document?appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=ishares-uk&locale=en_GB&portfolioId=${id}&component=fundDownloadV2&userType=individual`;
// The Swiss site has no such generic template: its "Historical NAVs" download link embeds a per-page document id
// that isn't just the portfolioId, so it is scraped straight off the fund page instead. Confirmed for CSGOLD
// (iShares Gold ETF (CH)), 2026-09-27.
async function ishNavCh(pageUrl) {
  try {
    const r = await fetch(pageUrl, { headers: { 'User-Agent': UA } });
    const t = await r.text();
    const m = t.match(/href="([^"]*\.ajax\?fileType=xls&fileName=[^"]*&dataType=fund)"/);
    return m ? new URL(m[1], pageUrl).href : null;
  } catch { return null; }
}

// listing: 'irish' | 'us' | 'canada' | 'switzerland'. Where each one's data comes from, best first:
//   page   an iShares fund page: inception scraped from it, and iShares' own NAV download (US funds add dividends).
//   src    'spdrgold' (GLD's own archive), 'tiingo' (US-listed, no issuer download: the user's free Tiingo token,
//          with dividends and splits) or 'wsj' (non-US gold listings: WSJ's spreadsheet, price only, fine for gold).
//   manual a typed date; `manualSrc` names where it was read (e.g. 'tiingo': its first row), else 'manual'.
// Yahoo Finance is no longer a source for any fund: it has no download button (its export is a paid feature).
// State Street's SPY/BIL files had NAV only, no dividends, so SPY comes from Tiingo and BIL gave way to SHV.
const ETFS = [
  // Equity / US. The three oldest S&P 500 ETFs and both Nasdaq-100 ones with real history (IQQ and QNDX, from
  // mid-2026, are too new). SPLG (2005) is left out: it tracked a different index until 2013.
  { cls: 'equity', region: 'us', asset: 'S&P 500', listing: 'us', name: 'SPDR S&P 500 ETF Trust', code: 'SPY', manual: '1993-01-29', manualSrc: 'tiingo', src: 'tiingo' },
  { cls: 'equity', region: 'us', asset: 'S&P 500', listing: 'us', name: 'iShares Core S&P 500 ETF', code: 'IVV', page: ishUs(239726, 'ishares-core-sp-500-etf') },
  { cls: 'equity', region: 'us', asset: 'S&P 500', listing: 'us', name: 'Vanguard S&P 500 ETF', code: 'VOO', manual: '2010-09-09', manualSrc: 'tiingo', src: 'tiingo' },
  { cls: 'equity', region: 'us', asset: 'Nasdaq 100', listing: 'us', name: 'Invesco QQQ Trust', code: 'QQQ', manual: '1999-03-10', manualSrc: 'tiingo', src: 'tiingo' },
  { cls: 'equity', region: 'us', asset: 'Nasdaq 100', listing: 'us', name: 'Invesco NASDAQ 100 ETF', code: 'QQQM', manual: '2020-10-13', manualSrc: 'tiingo', src: 'tiingo' },
  // Vanguard's VUAA is dropped: CSPX covers the same index and listing from 2010, with an issuer download.
  { cls: 'equity', region: 'us', asset: 'S&P 500', listing: 'irish', name: 'iShares Core S&P 500 UCITS ETF (Acc)', code: 'CSPX', page: ishUk(253743, 'ishares-core-sp-500-ucits-etf') },
  { cls: 'equity', region: 'us', asset: 'Nasdaq 100', listing: 'irish', name: 'iShares Nasdaq 100 UCITS ETF (Acc)', code: 'CNDX', page: ishUk(253741, 'ishares-nasdaq-100-ucits-etf') },
  // Equity / Global
  { cls: 'equity', region: 'global', asset: 'MSCI ACWI', listing: 'irish', name: 'iShares MSCI ACWI UCITS ETF (Acc)', code: 'SSAC', page: ishUk(251850, 'ishares-msci-acwi-ucits-etf') },
  { cls: 'equity', region: 'global', asset: 'MSCI World', listing: 'irish', name: 'iShares Core MSCI World UCITS ETF (Acc)', code: 'SWDA', page: ishUk(251882, 'ishares-msci-world-ucits-etf-acc-fund') },
  { cls: 'equity', region: 'global', asset: 'MSCI Emerging Markets', listing: 'irish', name: 'iShares Core MSCI EM IMI UCITS ETF (Acc)', code: 'EIMI', page: ishUk(264659, 'ishares-core-msci-em-imi-ucits-etf') },
  { cls: 'equity', region: 'global', asset: 'MSCI ACWI', listing: 'us', name: 'iShares MSCI ACWI ETF', code: 'ACWI', page: ishUs(239600, 'ishares-msci-acwi-etf') },
  // URTH and IEMG: confirmed 2026-10-02 in iShares' own files (daily NAV with dividends from 2012-01-10 and 2012-10-18).
  { cls: 'equity', region: 'global', asset: 'MSCI World', listing: 'us', name: 'iShares MSCI World ETF', code: 'URTH', page: ishUs(239696, 'ishares-msci-world-etf') },
  { cls: 'equity', region: 'global', asset: 'MSCI Emerging Markets', listing: 'us', name: 'iShares MSCI Emerging Markets ETF', code: 'EEM', manual: '2003-04-07', page: ishUs(239637, 'ishares-msci-emerging-markets-etf') },
  { cls: 'equity', region: 'global', asset: 'MSCI Emerging Markets', listing: 'us', name: 'iShares Core MSCI Emerging Markets ETF', code: 'IEMG', page: ishUs(244050, 'ishares-core-msci-emerging-markets-etf') },
  // Gold (priced world-wide in USD)
  // Gold ETFs: US-domiciled ones under the US region, Switzerland/Canada/Ireland (all Global-only) as listing
  // choices, Switzerland first. US gold has no domicile choice, so its ETFs carry no listing.
  { cls: 'gold', region: 'us', asset: 'Gold', name: 'SPDR Gold Shares', code: 'GLD', manual: '2004-11-18', src: 'spdrgold' },
  { cls: 'gold', region: 'us', asset: 'Gold', name: 'iShares Gold Trust', code: 'IAU', page: ishUs(239561, 'ishares-gold-trust-fund') },
  { cls: 'gold', region: 'us', asset: 'Gold', name: 'abrdn Physical Gold Shares ETF', code: 'SGOL', manual: '2009-09-09', manualSrc: 'tiingo', src: 'tiingo' },
  // Switzerland: genuine Swiss collective investment schemes under CISA (FINMA-regulated), holding physical gold
  // directly as fund property. Not UCITS funds and not debt securities (unlike the Irish ETCs below): Switzerland
  // is outside the UCITS Directive, so it has no need for the debt-note workaround.
  // CSGOLD: confirmed 2026-09-27, NAV download link scraped live off the fund page, returns a real .xls (200 OK).
  { cls: 'gold', region: 'global', asset: 'Gold', listing: 'switzerland', name: 'iShares Gold ETF (CH)', code: 'CSGOLD', page: ishCh(261149, 'ishares-gold-ch-fund') },
  // ZGLDUS: the USD share class of the Swisscanto/ZKB Gold ETF, launched 2009-01-15; WSJ's file starts 2009-01-16 (checked 2026-10-02). No
  // issuer download (swissfunddata.ch and Swisscanto checked) and SIX's own page gives ~5 months; WSJ lists it.
  { cls: 'gold', region: 'global', asset: 'Gold', listing: 'switzerland', name: 'Swisscanto (CH) Gold ETF (USD)', code: 'ZGLDUS', manual: '2009-01-16', manualSrc: 'wsj', src: 'wsj', wsj: 'etf/CH/XSWX/ZGLDUS' },
  // Canada: Ontario trusts holding physical gold directly as trust property (not debt securities). PHYS is the oldest
  // currently-tradeable USD one (iShares' CGL is CAD only, from 2011). KILO.U and VALT.U (younger, cheaper) are
  // dropped: neither has a free download, and PHYS covers the same metal from 2010.
  { cls: 'gold', region: 'global', asset: 'Gold', listing: 'canada', name: 'Sprott Physical Gold Trust', code: 'PHYS', manual: '2010-02-26', manualSrc: 'wsj', src: 'wsj', wsj: 'etf/PHYS' },
  // Ireland: legally a series of secured debt securities (limited-recourse bonds collateralised by gold) issued by
  // the ETC provider, not fund units -- UCITS forbids a fund from holding a single physical commodity, so the
  // gold-tracking product is structured as debt instead (UCITS-eligible under Article 50(1) of the Directive).
  // SGLD's London (USD) line on WSJ starts 2009-08-19 (confirmed 2026-09-30), about 8 weeks after the ETC launched.
  { cls: 'gold', region: 'global', asset: 'Gold', listing: 'irish', name: 'Invesco Physical Gold ETC', code: 'SGLD', manual: '2009-08-19', manualSrc: 'wsj', src: 'wsj', wsj: 'etf/UK/XLON/SGLD' },
  { cls: 'gold', region: 'global', asset: 'Gold', listing: 'irish', name: 'iShares Physical Gold ETC', code: 'SGLN', page: ishUk(258441, 'ishares-physical-gold-etc') },
  // Debt / US. SHV (0-1 year Treasuries, from 2007-01-05; iShares renamed it "0-1 Year Treasury Bond ETF") replaces
  // State Street's BIL: confirmed 2026-10-02, its iShares file carries every monthly dividend, which for a T-bill
  // fund is nearly all of its return (BIL's own file had NAV only).
  { cls: 'debt', region: 'us', asset: 'Short duration', listing: 'us', name: 'iShares 0-1 Year Treasury Bond ETF', code: 'SHV', page: ishUs(239466, 'ishares-short-treasury-bond-etf') },
  { cls: 'debt', region: 'us', asset: 'Short duration', listing: 'us', name: 'iShares 0-3 Month Treasury Bond ETF', code: 'SGOV', page: ishUs(314116, 'ishares-0-3-month-treasury-bond-etf') },
  { cls: 'debt', region: 'us', asset: 'Long duration', listing: 'us', name: 'iShares 20+ Year Treasury Bond ETF', code: 'TLT', page: ishUs(239454, 'ishares-20-year-treasury-bond-etf') },
  // IB01 IS the Acc share class (ISIN IE00BGSF1X88) -- confirmed live 2026-09-28 on iShares' own page ("USD
  // (Accumulating)"), and again by cross-referencing the same ISIN under its other exchange ticker, IBC1 (Xetra/
  // gettex). It just doesn't put "(Acc)" in its own title the way CSPX/VUAA/CNDX/etc. do, so distFlag()'s
  // name-text check alone would mislabel it Dist; the name here now carries the marker explicitly instead. There
  // never was a real Ireland/India-accumulating gap for this asset, despite an earlier pass concluding there was.
  { cls: 'debt', region: 'us', asset: 'Short duration', listing: 'irish', name: 'iShares $ Treasury Bond 0-1yr UCITS ETF (Acc)', code: 'IB01', page: ishUk(307243, 'ishares-usd-treasury-bond-01yr-ucits-etf') },
  // DTLA, not IDTL: IDTL is the Distributing share class; India/Ireland rows use accumulating where one exists (confirmed on ishares.com, 2026-09-27).
  { cls: 'debt', region: 'us', asset: 'Long duration', listing: 'irish', name: 'iShares $ Treasury Bond 20+yr UCITS ETF USD (Acc)', code: 'DTLA', page: ishUk(297191, 'ishares-treasury-bond-20-yr-ucits-etf-usd-acc-fund') },
  // Debt / Global. BNDW is the only US-listed global aggregate bond fund (BNDX, IAGG and IGOV leave out US bonds).
  { cls: 'debt', region: 'global', asset: 'Aggregate', listing: 'us', name: 'Vanguard Total World Bond ETF', code: 'BNDW', manual: '2018-09-06', manualSrc: 'tiingo', src: 'tiingo' },
  // Ireland: iShares Core Global Aggregate Bond, both accumulating USD classes, confirmed 2026-10-02 in iShares' own
  // files. USD Hedged (Acc) from 2017-11-21 is BNDW's exposure (US bonds plus hedged non-US) with a longer history;
  // the unhedged USD (Acc) class only started 2024-05-08. The fund's Distributing class (AGGG) is left out.
  { cls: 'debt', region: 'global', asset: 'Aggregate', listing: 'irish', name: 'iShares Core Global Aggregate Bond UCITS ETF USD Hedged (Acc)', code: 'AGGU', page: ishUk(291772, 'ishares-global-aggregate-bond-ucits-etf-usd-hedged-acc-fund') },
  { cls: 'debt', region: 'global', asset: 'Aggregate', listing: 'irish', name: 'iShares Core Global Aggregate Bond UCITS ETF USD (Acc)', code: 'AGAC', page: ishUk(337224, 'ishares-core-global-aggregate-bond-ucits-etf') },
];

// US index mutual funds, under MF › US funds (US assets only), all from Tiingo with dividends. VFINX, the first index
// fund (1976): Tiingo's rows carry no dividends before 1980-03-27, so it starts there (the earlier rows would show
// price only). The other dates are Tiingo's first rows (checked 2026-10-02 with the Xfina bookmark): FXAIX's
// current share class only from 2011 (its 1988 history sits under an older class), RYOCX's from 1995.
const US_FUNDS = [
  { asset: 'S&P 500', name: 'Vanguard 500 Index Fund Investor Shares', code: 'VFINX', manual: '1980-03-27', manualSrc: 'tiingoDiv' },
  { asset: 'S&P 500', name: 'Fidelity 500 Index Fund', code: 'FXAIX', manual: '2011-05-04', manualSrc: 'tiingo' },
  { asset: 'S&P 500', name: 'Schwab S&P 500 Index Fund', code: 'SWPPX', manual: '1997-05-20', manualSrc: 'tiingo' },
  { asset: 'Nasdaq 100', name: 'Rydex Nasdaq-100 Fund Investor Class', code: 'RYOCX', manual: '1995-01-03', manualSrc: 'tiingo' },
  { asset: 'Nasdaq 100', name: 'Victory Nasdaq-100 Index Fund', code: 'USNQX', manual: '2000-10-27', manualSrc: 'tiingo' },
];

// Indices: one instrument per asset, the benchmark itself. Start dates are only given where the
// publisher states one; the rest are left out rather than guessed.
const INDICES = [
  // Start dates are the oldest rows NSE Indices returns for each Total Returns Index (measured by calling the same
  // endpoint the historical data page uses, on 2026-09-26).
  ...[['Nifty 50', '1999-06-30'], ['Nifty Next 50', '2002-11-08'], ['Nifty Midcap 150', '2005-04-01'], ['Nifty Smallcap 250', '2005-04-01']].map(([a, since]) => ({ cls: 'equity', region: 'india', asset: a, name: `${a} TRI`, how: 'nseTri', ccy: 'INR', links: [L('NSE Indices historical data', NSE_HIST)], since })),
  // S&P 500, both from Yahoo Finance (its "Max" range, confirmed 2026-09-27/28): ^GSPC (price only) back to 1927,
  // further than S&P DJI's own site (10 years only) allows; ^SP500TR (Total Return, dividends reinvested into the
  // index level) from 1988-01-04, 9,756 rows. Kept as entries even though Yahoo has no download button (its export
  // is a paid feature): Xfina links the full range and reads Yahoo's columns, but offers no bookmark; how the table
  // becomes a file is up to the user. For a downloadable S&P 500 total return, IVV (iShares, from 2000) and VFINX
  // (Tiingo, from 1980) carry their dividends.
  { cls: 'equity', region: 'us', asset: 'S&P 500', name: 'S&P 500 (^GSPC, price only)', how: 'yahoo', ccy: 'USD', since: '1927-12-30', src: 'yahoo', ret: 'Price only', links: [L('^GSPC history, full range', yahooRange('^GSPC', '1927-12-30'))] },
  { cls: 'equity', region: 'us', asset: 'S&P 500', name: 'S&P 500 Total Return (^SP500TR)', how: 'yahoo', ccy: 'USD', since: '1988-01-04', src: 'yahoo', ret: 'Total return', links: [L('^SP500TR history, full range', yahooRange('^SP500TR', '1988-01-04'))] },
  // Nasdaq-100: Nasdaq's own index portal (indexes.nasdaq.com, a different site from the nasdaq.com consumer page,
  // whose own calendar is ~10 years) has a real "All" range and a direct, no-login .xlsx export
  // (Index/ExportHistory/<symbol>?startDate=...&endDate=...&timeOfDay=EOD), confirmed live 2026-09-28: both NDX
  // (price, from 1985-01-31, matching Yahoo's depth) and XNDX (Total Return, genuinely from 1999-03-04 -- Yahoo's
  // ^XNDX has no history at all, a wrong "no free total-return series exists" call made here on 2026-09-27 before
  // this site was checked). NDX replaces the Yahoo-sourced price entry (same depth, a direct download instead of a
  // bookmarklet); XNDX is new, and oldest-first still puts NDX ahead of it since 1985 predates 1999.
  { cls: 'equity', region: 'us', asset: 'Nasdaq 100', name: 'Nasdaq-100 (NDX, price only)', how: 'nasdaqIndex', ccy: 'USD', since: '1985-01-31', src: 'nasdaq', ret: 'Price only', links: [L('NDX history', 'https://indexes.nasdaq.com/Index/History/NDX'), L('NDX download (Excel)', nasdaqExport('NDX', '1985-01-31'))] },
  { cls: 'equity', region: 'us', asset: 'Nasdaq 100', name: 'Nasdaq-100 Total Return (XNDX)', how: 'nasdaqIndex', ccy: 'USD', since: '1999-03-04', src: 'nasdaq', ret: 'Total return', links: [L('XNDX history', 'https://indexes.nasdaq.com/Index/History/XNDX'), L('XNDX download (Excel)', nasdaqExport('XNDX', '1999-03-04'))] },
  // Free full history on the index's own page (Performance tab, Cumulative performance, Full history, the download
  // icon), no account needed: confirmed for all three, monthly, starting 1998-12-31, on 2026-09-27. The page shows one
  // return variant with no toggle and no label, so the name says just "Index", not Price/Gross/Net Total Return.
  // The free page's own performance chart makes its own request to /indexes/api/index/performance with a
  // variant= query param -- confirmed live 2026-09-28 for MSCI ACWI and MSCI World (both "Full history" and the
  // default 1yr view): variant=NETR, i.e. Net Total Return, USD. Not shown anywhere in the page's own UI text,
  // only in that request; taken as confirmed for MSCI Emerging Markets too (same page template, only indexCode
  // differs).
  ...[['MSCI ACWI', 892400], ['MSCI World', 990100], ['MSCI Emerging Markets', 891800]].map(([a, id]) => ({ cls: 'equity', region: 'global', asset: a, name: `${a} Index`, how: 'msci', ccy: 'USD', since: '1998-12-31', src: 'publisher', ret: 'Net Total Return', links: [L(`${a} on MSCI`, `https://www.msci.com/indexes/index/${id}`)] })),
  // Gold has no Index option world-wide: the LBMA Gold Price history needs an IBA licence (MyLBMA portal, free only
  // on application for non-commercial use), and no free spot-gold ticker exists on Yahoo (only GC=F, a futures
  // contract, excluded on purpose). India: MCX Spot Market Price for GOLD, Ahmedabad (the only location MCX polls
  // gold at, checked across all locations on 2026-09-27), real data from 2005-06-06, polled several times a day.
  // This is also, since 1 April 2026, what SEBI requires Indian gold ETFs and funds to value themselves against
  // (domestic exchange spot prices, replacing LBMA), so it is the closest thing to their own benchmark.
  { cls: 'gold', region: 'india', asset: 'Gold', name: 'MCX Spot Market Price: Gold (Ahmedabad)', how: 'mcxSpot', ccy: 'INR', since: '2005-06-06', src: 'mcx', ret: 'Spot price', links: [L('MCX Spot Market Price', 'https://www.mcxindia.com/market-data/spot-market-price')] },
  // Debt start dates: the first rows Historical Index Data (Fixed Income) returns for Nifty 1D Rate Index and Nifty 10 yr
  // Benchmark G-Sec, found by asking year by year on the page (2010 empty, 2011 from 3 Jan), on 2026-09-27.
  { cls: 'debt', region: 'india', asset: 'Short duration', name: 'NSE short-duration debt index (Liquid or 1D Rate)', how: 'nseTri', ccy: 'INR', since: '2011-01-03', links: [L('NSE Indices historical data', NSE_HIST)] },
  { cls: 'debt', region: 'india', asset: 'Long duration', name: 'Nifty 10 yr Benchmark G-Sec Index', how: 'nseTri', ccy: 'INR', since: '2011-01-03', links: [L('NSE Indices historical data', NSE_HIST)] },
];

// ---------------------------------------------------------------- assemble
const nodes = new Map();
const node = (cls, region, vehicle, listing, asset) => {
  const key = [cls, region, vehicle, listing || '', asset].join('|');
  if (!nodes.has(key)) nodes.set(key, { class: cls, region, vehicle, ...(listing ? { listing } : {}), asset, instruments: [] });
  return nodes.get(key);
};

console.log('Reading the AMFI scheme list from mfapi.in ...');
const schemes = await loadSchemes();
console.log(`  ${schemes.length} schemes`);

async function fromSchemes(def, region, cls, { etfs: withEtfs = true } = {}) {
  const pool_ = schemes.filter((s) => def.re.test(s.schemeName) && !(def.no && def.no.test(s.schemeName)) && !NOT_GROWTH.test(s.schemeName));
  const etfs = pool_.filter((s) => isEtf(s.schemeName));
  // Equity: index funds only. Indian funds that feed a US index are usually fund-of-funds, so those are allowed there.
  const mfs = pool_.filter((s) => !isEtf(s.schemeName) && (cls !== 'equity' || /index/i.test(s.schemeName) || (def.feeder && FOF.test(s.schemeName))));
  const cap = (a) => a.slice(0, 160);
  const [me, mm] = [withEtfs ? await measure(cap(etfs)) : [], await measure(cap(mfs))];
  if (withEtfs) node(cls, region, 'etf', null, def.asset).instruments.push(...oldestFirst(me, 'etf'));
  // Regular and Direct plans are kept apart: Regular carries the longer history (Direct plans only exist
  // from 2013-01-01, Quantum excepted), Direct costs less. The guide lets the user choose between them.
  //
  // Direct picks the same KEEP funds Regular did (matched by baseKey), not its own independent top KEEP --
  // otherwise someone wanting to compare Direct vs Regular for "the oldest funds" can land on two different
  // fund lists. Confirmed live 2026-09-28: India/Equity/Nifty 50 Direct was Franklin, HDFC, Aditya Birla --
  // not ICICI, despite ICICI being Regular's #1 (2006) -- because nearly every AMC's Direct plan is clamped to
  // within a day of 2013-01-01, so the tie-break fell to alphabetical order (Aditya Birla < ICICI) and HDFC's
  // Direct plan won a slot ICICI's Regular-oldest fund never got a matching shot at. Regular still ranks by
  // its own age (the fund's real age, Quantum aside); Direct is derived from that ranking, not its own.
  const isDirect = (r) => FORCE_DIRECT.has(r.c.schemeCode) || /direct/i.test(r.c.schemeName);
  const regRows = mm.filter((r) => !isDirect(r));
  const dirRows = mm.filter(isDirect);
  const bestOf = (rows) => { const m = new Map(); for (const r of rows) { const k = baseKey(r.c.schemeName); const cur = m.get(k); if (!cur || r.trueFirst < cur.trueFirst) m.set(k, r); } return m; };
  const regBest = bestOf(regRows);
  const dirBest = bestOf(dirRows);
  const topKeys = [...regBest.entries()].sort(([, a], [, b]) => a.first.localeCompare(b.first) || a.trueFirst.localeCompare(b.trueFirst) || (AUM_CR[b.c.schemeCode] || 0) - (AUM_CR[a.c.schemeCode] || 0) || a.c.schemeName.localeCompare(b.c.schemeName)).slice(0, KEEP).map(([k]) => k);
  node(cls, region, 'mf', 'regular', def.asset).instruments.push(...topKeys.map((k) => regBest.get(k)).filter(Boolean).map((r) => toInstrument(r, 'mf')));
  node(cls, region, 'mf', 'direct', def.asset).instruments.push(...topKeys.map((k) => dirBest.get(k)).filter(Boolean).map((r) => toInstrument(r, 'mf')));
  console.log(`  ${cls}/${region}/${def.asset}: ${etfs.length} ETF candidates → ${me.length} live, ${mfs.length} fund candidates → ${mm.length} live`);
}
// Indian ETFs come from NSE (below), so from AMFI only the mutual funds are taken here.
for (const d of INDIA) await fromSchemes(d, 'india', d.cls, { etfs: false });
console.log('Reading the NSE ETF list ...');
await indiaEtfs();
// Feeder ETFs are listed under Indian ETFs (below), so only the funds are taken here.
for (const d of FEEDERS) await fromSchemes(d, 'us', 'equity', { etfs: false });
console.log('Reading ETF inception dates ...');
// Each ETF's source, from the ETFS entry: an iShares page (issuer NAV file, found and checked by hand 2026-09-27/
// 2026-10-02), SPDR Gold's own archive for GLD, Tiingo for US-listed funds with no issuer download, WSJ for the
// non-US gold listings. Every entry names one; there is no fallback source.
const etfInst = await pool(ETFS, 6, async (e) => {
  let inception = e.manual || null, dateSource = e.manual ? (e.manualSrc || 'manual') : null;
  if (e.page) { const d = await isharesInception(e.page); if (d) { inception = d; dateSource = 'issuer'; } else console.warn(`  ! no inception found on ${e.page}`); }
  const ishMatch = e.page && e.page.match(/ishares\.com\/(us\/products|uk\/individual\/en\/products|ch\/individual\/en\/products)\/(\d+)\//);
  let how, returnType, links;
  if (ishMatch) {
    how = 'ishares'; returnType = 'NAV';
    const site = ishMatch[1];
    const navUrl = site.startsWith('us') ? ishNavUs(ishMatch[2]) : site.startsWith('uk') ? ishNavUk(ishMatch[2]) : await ishNavCh(e.page);
    if (!navUrl) console.warn(`  ! no NAV download link found on ${e.page}`);
    links = navUrl ? [L(`${e.code} NAV history (Excel)`, navUrl), L(`${e.code} fund page`, e.page)] : [L(`${e.code} fund page`, e.page)];
  } else if (e.src === 'spdrgold') {
    how = 'spdrgold'; returnType = 'NAV';
    links = [L(`${e.code} historical data (Excel)`, 'https://api.spdrgoldshares.com/api/v1/historical-archive?product=gld&exchange=NYSE&lang=en')];
  } else if (e.src === 'tiingo') {
    how = 'tiingo'; returnType = 'Market price';
    links = [L(`${e.code} on Tiingo`, tiingo(e.code))];
  } else if (e.src === 'wsj') {
    how = 'wsj'; returnType = 'Market price';
    links = [L(`${e.code} on WSJ`, wsjPage(e.wsj)), L(`${e.code} download (CSV)`, wsjDownload(e.wsj, inception))];
  } else throw new Error(`no source for ${e.code}`);
  // Other sources the user may pick instead (the guide adds "your own file" to every dataset). Tiingo carries every
  // US-listed fund (PHYS trades on NYSE too), with dividends and splits; it needs the user's own free token.
  const usListed = e.listing === 'us' || (e.cls === 'gold' && e.region === 'us') || e.code === 'PHYS';
  const alts = usListed && how !== 'tiingo' ? [{ how: 'tiingo', links: [L(`${e.code} on Tiingo`, tiingo(e.code))] }] : undefined;
  return { e, inst: { id: `etf-${e.code.toLowerCase()}`, name: e.name, code: e.code, inception, dateSource, ccy: 'USD', returnType, how, kind: 'ETF', links, ...(alts ? { alts } : {}) } };
});
for (const { e, inst } of etfInst) {
  const n = node(e.cls, e.region, 'etf', e.listing, e.asset);
  n.instruments.push({ ...inst, asset: e.asset });
}
for (const f of US_FUNDS) {
  node('equity', 'us', 'mf', 'usfund', f.asset).instruments.push({
    id: `usmf-${f.code.toLowerCase()}`, name: f.name, code: f.code, inception: f.manual, dateSource: f.manualSrc || 'manual',
    ccy: 'USD', returnType: 'NAV', how: 'tiingo', kind: 'MF', links: [L(`${f.code} on Tiingo`, tiingo(f.code))],
  });
}
// Indian ETFs that track US indices: listed on NSE in INR. Global equity has none: the Hang Seng ones do not
// follow the MSCI indexes that Global equity is built on. The date is the first NAV AMFI holds
// for the same fund, found by name, so nothing here is typed.
const FOREIGN = [
  // Only the plain index: the S&P 500 Top 50, NYSE FANG+ and Nasdaq Q-50 ETFs are factor or subset indexes, not the
  // S&P 500 or Nasdaq-100 the rest of the catalogue compares. NSE lists no plain S&P 500 ETF.
  { sym: 'MON100', name: 'Motilal Oswal Nasdaq 100 ETF', region: 'us', asset: 'Nasdaq 100', re: /motilal.*nasdaq\s*100 etf/i },
];
console.log('Reading Indian ETFs on foreign indices ...');
for (const f of FOREIGN) {
  const cand = schemes.filter((x) => f.re.test(x.schemeName) && !(f.no && f.no.test(x.schemeName)) && !FOF.test(x.schemeName));
  const live = (await measure(cand)).sort((a, b) => a.first.localeCompare(b.first))[0];
  if (!live) console.warn(`  ! no live AMFI record for ${f.sym}`);
  node('equity', f.region, 'etf', 'india', f.asset).instruments.push({
    id: `nse-${f.sym.toLowerCase()}`, name: f.name, code: f.sym, inception: live?.first || null, dateSource: live ? 'amfi' : null,
    ccy: 'INR', returnType: 'Market price', how: 'nseEtf', kind: 'ETF',
    links: [L('NSE historical price data', 'https://www.nseindia.com/report-detail/eq_security'), L(`${f.sym} on NSE`, `https://www.nseindia.com/get-quotes/equity?symbol=${f.sym}`)],
  });
}

// A stable, content-derived id (matching etf-<code> and mf<schemeCode>): a sequential idx-<n> would silently
// reassign every index's id on the next run whose order or count changed, breaking anyone's saved selection
// (picked ids are kept in the browser's own storage across regenerations). Found live 2026-09-28: re-running
// this script did exactly that for the four indices added by hand this session.
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
for (const i of INDICES) {
  const n = node(i.cls, i.region, 'index', null, i.asset);
  n.instruments.push({ id: `idx-${slug(i.name)}`, name: i.name, inception: i.since || null, dateSource: i.since ? (i.src || 'nse') : null, ccy: i.ccy, returnType: i.ret || 'Total return', how: i.how, kind: 'Index', links: i.links });
}

// Oldest first; instruments without a known date go last. Keep the top KEEP.
const byAge = (a, b) => (a.inception && b.inception ? a.inception.localeCompare(b.inception) : a.inception ? -1 : b.inception ? 1 : 0);
const list = [...nodes.values()].map((n) => ({ ...n, instruments: n.instruments.sort(byAge).slice(0, KEEP).map(({ turnover, ...i }) => i) })).filter((n) => n.instruments.length);

await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), keep: KEEP, nodes: list }, null, 1));
console.log(`\nWrote ${list.length} leaves, ${list.reduce((s, n) => s + n.instruments.length, 0)} instruments → src/portfolio-engine/tree.json`);
