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
    const first = iso(j.data.at(-1).date), last = iso(j.data[0].date);
    if (TODAY - day(last) > STALE_DAYS) return null;
    return { c, meta: j.meta, first, last, n: j.data.length };
  });
  return rows.filter(Boolean);
}
function toInstrument(r, vehicle) {
  const name = r.c.schemeName.replace(/\s+/g, ' ').trim();
  return {
    id: `mf${r.c.schemeCode}`, name, code: String(r.c.schemeCode), plan: planOf(name) || undefined,
    inception: r.first, lastNav: r.last, observations: r.n, dateSource: 'mfapi',
    ccy: 'INR', returnType: 'Adjusted price', how: 'mfapi', kind: vehicle === 'etf' ? 'ETF' : 'MF',
    links: [L('NAV data (JSON)', `https://api.mfapi.in/mf/${r.c.schemeCode}`), L('AMFI NAV history', AMFI)],
  };
}
function oldestFirst(rows, vehicle) {
  // One row per fund: the same fund appears as Regular and Direct, and the older plan has the longer history.
  const best = new Map();
  for (const r of rows) { const k = baseKey(r.c.schemeName); const cur = best.get(k); if (!cur || r.first < cur.first) best.set(k, r); }
  return [...best.values()].sort((a, b) => a.first.localeCompare(b.first) || a.c.schemeName.localeCompare(b.c.schemeName)).slice(0, KEEP).map((r) => toInstrument(r, vehicle));
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
  MID150BEES: ['Nippon India ETF Nifty Midcap 150', '2019-02-01', 'amfi'],
  GOLDBEES: ['Nippon India ETF Gold BeES', '2007-03-08', 'manual'],
  QGOLDHALF: ['Quantum Gold ETF', '2008-02-27', 'amfi'],
  LIQUIDBEES: ['Nippon India ETF Liquid BeES', '2003-07-08', 'manual'],
  LIQUID1: ['Kotak Nifty 1D Rate Liquid ETF', '2023-01-31', 'amfi'],
  LICNETFGSC: ['LIC MF Nifty 8-13 yr G-Sec ETF', '2014-12-26', 'amfi'],
  LTGILTBEES: ['Nippon India ETF Nifty 8-13 yr G-Sec Long Term Gilt', '2016-07-07', 'amfi'],
};
// Which NSE ETFs belong to which asset, by the underlying NSE prints for each.
const NSE_ASSETS = [
  { cls: 'equity', asset: 'Nifty 50', re: /^nifty 50$/i },
  { cls: 'equity', asset: 'Nifty Next 50', re: /next 50/i, no: /sensex|bse|momentum|quality|alpha|low vol/i, also: ['JUNIORBEES'] },
  { cls: 'equity', asset: 'Nifty Midcap 150', re: /midcap ?150/i, no: /momentum|quality|bse|alpha|low vol/i },
  { cls: 'equity', asset: 'Nifty Smallcap 250', re: /smallcap ?250/i, no: /momentum|quality|bse|alpha|low vol/i },
  { cls: 'gold', asset: 'Gold', re: /^gold$/i },
  { cls: 'debt', asset: 'Short duration', re: /nifty ?1d rate/i, also: ['LIQUIDBEES'] },
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
        turnover: Number(r.trdVal) || 0, ccy: 'INR', returnType: 'Price only', how: 'nseEtf', kind: 'ETF',
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
    return m ? fmt(m[3], m[1], m[2]) : null;
  } catch { return null; }
}
const yahoo = (t) => `https://finance.yahoo.com/quote/${t}/history/`;
const ishUk = (id, slug) => `https://www.ishares.com/uk/individual/en/products/${id}/${slug}`;
const ishUs = (id, slug) => `https://www.ishares.com/us/products/${id}/${slug}`;

// listing: 'irish' | 'us'. `page` is scraped for the inception date; `manual` is a typed date.
const ETFS = [
  // Equity / US
  { cls: 'equity', region: 'us', asset: 'S&P 500', listing: 'us', name: 'SPDR S&P 500 ETF Trust', code: 'SPY', manual: '1993-01-22', links: [L('SPY price history', yahoo('SPY'))] },
  { cls: 'equity', region: 'us', asset: 'S&P 500', listing: 'us', name: 'iShares Core S&P 500 ETF', code: 'IVV', page: ishUs(239726, 'ishares-core-sp-500-etf'), links: [L('IVV price history', yahoo('IVV'))] },
  { cls: 'equity', region: 'us', asset: 'S&P 500', listing: 'us', name: 'Vanguard S&P 500 ETF', code: 'VOO', manual: '2010-09-07', links: [L('VOO price history', yahoo('VOO'))] },
  { cls: 'equity', region: 'us', asset: 'Nasdaq 100', listing: 'us', name: 'Invesco QQQ Trust', code: 'QQQ', manual: '1999-03-10', links: [L('QQQ price history', yahoo('QQQ'))] },
  { cls: 'equity', region: 'us', asset: 'S&P 500', listing: 'irish', name: 'iShares Core S&P 500 UCITS ETF (Acc)', code: 'CSPX', page: ishUk(253743, 'ishares-core-sp-500-ucits-etf') },
  { cls: 'equity', region: 'us', asset: 'S&P 500', listing: 'irish', name: 'Vanguard S&P 500 UCITS ETF (Acc)', code: 'VUAA', manual: '2019-05-14', links: [L('VUAA price history', yahoo('VUAA.L'))] },
  { cls: 'equity', region: 'us', asset: 'Nasdaq 100', listing: 'irish', name: 'iShares Nasdaq 100 UCITS ETF (Acc)', code: 'CNDX', page: ishUk(253741, 'ishares-nasdaq-100-ucits-etf') },
  // Equity / Global
  { cls: 'equity', region: 'global', asset: 'MSCI ACWI', listing: 'irish', name: 'iShares MSCI ACWI UCITS ETF (Acc)', code: 'SSAC', page: ishUk(251850, 'ishares-msci-acwi-ucits-etf') },
  { cls: 'equity', region: 'global', asset: 'MSCI World', listing: 'irish', name: 'iShares Core MSCI World UCITS ETF (Acc)', code: 'SWDA', page: ishUk(251882, 'ishares-msci-world-ucits-etf-acc-fund'), extra: [L('IWDA price history', yahoo('IWDA.L'))] },
  { cls: 'equity', region: 'global', asset: 'MSCI Emerging Markets', listing: 'irish', name: 'iShares Core MSCI EM IMI UCITS ETF (Acc)', code: 'EIMI', page: ishUk(264659, 'ishares-core-msci-em-imi-ucits-etf') },
  { cls: 'equity', region: 'global', asset: 'MSCI ACWI', listing: 'us', name: 'iShares MSCI ACWI ETF', code: 'ACWI', page: ishUs(239600, 'ishares-msci-acwi-etf'), links: [L('ACWI price history', yahoo('ACWI'))] },
  { cls: 'equity', region: 'global', asset: 'MSCI Emerging Markets', listing: 'us', name: 'iShares MSCI Emerging Markets ETF', code: 'EEM', manual: '2003-04-07', page: ishUs(239590, 'ishares-msci-emerging-markets-etf'), links: [L('EEM price history', yahoo('EEM'))] },
  // Gold (US and Global share these; gold is priced world-wide in USD)
  ...['us', 'global'].flatMap((region) => [
    { cls: 'gold', region, asset: 'Gold', listing: 'us', name: 'SPDR Gold Shares', code: 'GLD', manual: '2004-11-18', links: [L('GLD price history', yahoo('GLD'))] },
    { cls: 'gold', region, asset: 'Gold', listing: 'us', name: 'iShares Gold Trust', code: 'IAU', page: ishUs(239561, 'ishares-gold-trust-fund'), links: [L('IAU price history', yahoo('IAU'))] },
    { cls: 'gold', region, asset: 'Gold', listing: 'irish', name: 'iShares Physical Gold ETC', code: 'SGLN', page: ishUk(258441, 'ishares-physical-gold-etc') },
  ]),
  // Debt / US
  { cls: 'debt', region: 'us', asset: 'Short duration', listing: 'us', name: 'iShares 0-3 Month Treasury Bond ETF', code: 'SGOV', page: ishUs(314116, 'ishares-0-3-month-treasury-bond-etf'), links: [L('SGOV price history', yahoo('SGOV'))] },
  { cls: 'debt', region: 'us', asset: 'Short duration', listing: 'us', name: 'SPDR Bloomberg 1-3 Month T-Bill ETF', code: 'BIL', manual: '2007-05-30', links: [L('BIL price history', yahoo('BIL'))] },
  { cls: 'debt', region: 'us', asset: 'Long duration', listing: 'us', name: 'iShares 20+ Year Treasury Bond ETF', code: 'TLT', page: ishUs(239454, 'ishares-20-year-treasury-bond-etf'), links: [L('TLT price history', yahoo('TLT'))] },
  { cls: 'debt', region: 'us', asset: 'Short duration', listing: 'irish', name: 'iShares $ Treasury Bond 0-1yr UCITS ETF', code: 'IB01', page: ishUk(307243, 'ishares-usd-treasury-bond-01yr-ucits-etf'), extra: [L('IB01 price history', yahoo('IB01.L'))] },
  { cls: 'debt', region: 'us', asset: 'Long duration', listing: 'irish', name: 'iShares $ Treasury Bond 20+yr UCITS ETF', code: 'IDTL', page: ishUk(272124, 'ishares-usd-treasury-bond-20-yr-ucits-etf') },
  // Debt / Global
  { cls: 'debt', region: 'global', asset: 'Aggregate', listing: 'us', name: 'Vanguard Total World Bond ETF', code: 'BNDW', manual: '2018-09-04', links: [L('BNDW price history', yahoo('BNDW'))] },
  { cls: 'debt', region: 'global', asset: 'Aggregate', listing: 'irish', name: 'iShares Core Global Aggregate Bond UCITS ETF', code: 'AGGG', page: ishUk(291773, 'ishares-core-global-aggregate-bond-ucits-etf') },
];

// Indices: one instrument per asset, the benchmark itself. Start dates are only given where the
// publisher states one; the rest are left out rather than guessed.
const INDICES = [
  ...['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'].map((a) => ({ cls: 'equity', region: 'india', asset: a, name: `${a} TRI`, how: 'nseTri', ccy: 'INR', links: [L('NSE Indices historical data', NSE_HIST)], since: a === 'Nifty 50' ? '1999-06-30' : null })),
  { cls: 'equity', region: 'us', asset: 'S&P 500', name: 'S&P 500 Total Return', how: 'spdji', ccy: 'USD', links: [L('S&P 500 on S&P Dow Jones Indices', 'https://www.spglobal.com/spdji/en/indices/equity/sp-500/')] },
  { cls: 'equity', region: 'us', asset: 'Nasdaq 100', name: 'Nasdaq-100 Total Return (XNDX)', how: 'nasdaqIdx', ccy: 'USD', links: [L('XNDX history', 'https://indexes.nasdaqomx.com/Index/History/XNDX')] },
  ...[['MSCI ACWI', 892400], ['MSCI World', 990100], ['MSCI Emerging Markets', 891800]].map(([a, id]) => ({ cls: 'equity', region: 'global', asset: a, name: `${a} Net Total Return`, how: 'msci', ccy: 'USD', links: [L(`${a} on MSCI`, `https://www.msci.com/indexes/index/${id}`)] })),
  ...['us', 'global'].map((region) => ({ cls: 'gold', region, asset: 'Gold', name: 'LBMA Gold Price (USD)', how: 'lbma', ccy: 'USD', ret: 'Price only', links: [L('LBMA precious metal prices', 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices')] })),
  // India gold has no free downloadable index history: IBJA (ibjarates.com) publishes today's rate and the last
  // 30 days only, and its API with history is paid. Indian gold is covered by gold ETFs and funds instead.
  { cls: 'debt', region: 'india', asset: 'Short duration', name: 'NSE short-duration debt index (Liquid or 1D Rate)', how: 'nseTri', ccy: 'INR', links: [L('NSE Indices historical data', NSE_HIST)] },
  { cls: 'debt', region: 'india', asset: 'Long duration', name: 'Nifty 10 yr Benchmark G-Sec Index', how: 'nseTri', ccy: 'INR', links: [L('NSE Indices historical data', NSE_HIST)] },
];

// ---------------------------------------------------------------- assemble
const nodes = new Map();
const node = (cls, region, vehicle, listing, asset) => {
  const key = [cls, region, vehicle, listing || '', asset].join('|');
  if (!nodes.has(key)) nodes.set(key, { class: cls, region, vehicle, ...(listing ? { listing } : {}), asset, instruments: [] });
  return nodes.get(key);
};
let seq = 0;

console.log('Reading the AMFI scheme list from mfapi.in ...');
const schemes = await loadSchemes();
console.log(`  ${schemes.length} schemes`);

async function fromSchemes(def, region, cls, { etfs: withEtfs = true } = {}) {
  const pool_ = schemes.filter((s) => def.re.test(s.schemeName) && !(def.no && def.no.test(s.schemeName)) && !NOT_GROWTH.test(s.schemeName));
  const etfs = pool_.filter((s) => isEtf(s.schemeName));
  // Equity: index funds only. Indian funds that feed a US index are usually fund-of-funds, so those are allowed there.
  const mfs = pool_.filter((s) => !isEtf(s.schemeName) && (cls !== 'equity' || /index/i.test(s.schemeName) || (def.feeder && FOF.test(s.schemeName))));
  const cap = (a) => a.slice(0, 80);
  const [me, mm] = [withEtfs ? await measure(cap(etfs)) : [], await measure(cap(mfs))];
  if (withEtfs) node(cls, region, 'etf', null, def.asset).instruments.push(...oldestFirst(me, 'etf'));
  node(cls, region, 'mf', null, def.asset).instruments.push(...oldestFirst(mm, 'mf'));
  console.log(`  ${cls}/${region}/${def.asset}: ${etfs.length} ETF candidates → ${me.length} live, ${mfs.length} fund candidates → ${mm.length} live`);
}
// Indian ETFs come from NSE (below), so from AMFI only the mutual funds are taken here.
for (const d of INDIA) await fromSchemes(d, 'india', d.cls, { etfs: false });
console.log('Reading the NSE ETF list ...');
await indiaEtfs();
// Feeder ETFs are listed under Indian ETFs (below), so only the funds are taken here.
for (const d of FEEDERS) await fromSchemes(d, 'us', 'equity', { etfs: false });
console.log('Reading ETF inception dates ...');
const etfInst = await pool(ETFS, 6, async (e) => {
  let inception = e.manual || null, dateSource = e.manual ? 'manual' : null;
  if (e.page) { const d = await isharesInception(e.page); if (d) { inception = d; dateSource = 'issuer'; } else console.warn(`  ! no inception found on ${e.page}`); }
  const links = e.links || [L(`${e.code} fund page`, e.page)];
  if (e.page && e.links) links.unshift(L(`${e.code} fund page`, e.page));
  if (e.extra) links.push(...e.extra);
  return { e, inst: { id: `etf-${e.code.toLowerCase()}`, name: e.name, code: e.code, inception, dateSource, ccy: 'USD', returnType: 'Adjusted price', how: e.page && e.listing === 'irish' ? 'ishares' : 'yahoo', kind: 'ETF', links } };
});
for (const { e, inst } of etfInst) {
  const n = node(e.cls, e.region, 'etf', e.listing, e.asset);
  n.instruments.push({ ...inst, asset: e.asset });
}
// Indian ETFs that track US and global indices: listed on NSE in INR. The date is the first NAV AMFI holds
// for the same fund, found by name, so nothing here is typed.
const FOREIGN = [
  { sym: 'MON100', name: 'Motilal Oswal Nasdaq 100 ETF', region: 'us', asset: 'Nasdaq 100', re: /motilal.*nasdaq\s*100 etf/i },
  { sym: 'MASPTOP50', name: 'Mirae Asset S&P 500 Top 50 ETF', region: 'us', asset: 'S&P 500 Top 50', re: /mirae.*s&p 500 top 50 etf\s*$/i },
  { sym: 'MAFANG', name: 'Mirae Asset NYSE FANG+ ETF', region: 'us', asset: 'NYSE FANG+', re: /mirae.*fang.*etf\s*$/i },
  { sym: 'MONQ50', name: 'Motilal Oswal Nasdaq Q 50 ETF', region: 'us', asset: 'Nasdaq Q-50', re: /motilal.*nasdaq q.?50 etf/i },
  { sym: 'HNGSNGBEES', name: 'Nippon India ETF Hang Seng BeES', region: 'global', asset: 'Hang Seng', re: /hang seng (bees|etf)/i, no: /tech/i },
  { sym: 'MAHKTECH', name: 'Mirae Asset Hang Seng TECH ETF', region: 'global', asset: 'Hang Seng', re: /hang seng tech etf/i },
];
console.log('Reading Indian ETFs on foreign indices ...');
for (const f of FOREIGN) {
  const cand = schemes.filter((x) => f.re.test(x.schemeName) && !(f.no && f.no.test(x.schemeName)) && !FOF.test(x.schemeName));
  const live = (await measure(cand)).sort((a, b) => a.first.localeCompare(b.first))[0];
  if (!live) console.warn(`  ! no live AMFI record for ${f.sym}`);
  node('equity', f.region, 'etf', 'india', f.asset).instruments.push({
    id: `nse-${f.sym.toLowerCase()}`, name: f.name, code: f.sym, inception: live?.first || null, dateSource: live ? 'amfi' : null,
    ccy: 'INR', returnType: 'Price only', how: 'nseEtf', kind: 'ETF',
    links: [L('NSE historical price data', 'https://www.nseindia.com/report-detail/eq_security'), L(`${f.sym} on NSE`, `https://www.nseindia.com/get-quotes/equity?symbol=${f.sym}`)],
  });
}

for (const i of INDICES) {
  const n = node(i.cls, i.region, 'index', null, i.asset);
  n.instruments.push({ id: `idx-${++seq}`, name: i.name, inception: i.since || null, dateSource: i.since ? 'publisher' : null, ccy: i.ccy, returnType: i.ret || 'Total return', how: i.how, kind: 'Index', links: i.links });
}

// Oldest first; instruments without a known date go last. Keep the top KEEP.
const byAge = (a, b) => (a.inception && b.inception ? a.inception.localeCompare(b.inception) : a.inception ? -1 : b.inception ? 1 : 0);
const list = [...nodes.values()].map((n) => ({ ...n, instruments: n.instruments.sort(byAge).slice(0, KEEP).map(({ turnover, ...i }) => i) })).filter((n) => n.instruments.length);

await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), keep: KEEP, nodes: list }, null, 1));
console.log(`\nWrote ${list.length} leaves, ${list.reduce((s, n) => s + n.instruments.length, 0)} instruments → src/portfolio-engine/tree.json`);
