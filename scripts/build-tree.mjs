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
  { cls: 'gold', region: 'india', asset: 'Gold', name: 'Domestic gold rate (INR)', how: 'ibja', ccy: 'INR', ret: 'Price only', links: [L('IBJA rates', 'https://ibjarates.com/')] },
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

async function fromSchemes(def, region, cls) {
  const pool_ = schemes.filter((s) => def.re.test(s.schemeName) && !(def.no && def.no.test(s.schemeName)) && !NOT_GROWTH.test(s.schemeName));
  const etfs = pool_.filter((s) => isEtf(s.schemeName));
  // Equity: index funds only. Indian funds that feed a US index are usually fund-of-funds, so those are allowed there.
  const mfs = pool_.filter((s) => !isEtf(s.schemeName) && (cls !== 'equity' || /index/i.test(s.schemeName) || (def.feeder && FOF.test(s.schemeName))));
  const cap = (a) => a.slice(0, 80);
  const [me, mm] = [await measure(cap(etfs)), await measure(cap(mfs))];
  node(cls, region, 'etf', null, def.asset).instruments.push(...oldestFirst(me, 'etf'));
  node(cls, region, 'mf', null, def.asset).instruments.push(...oldestFirst(mm, 'mf'));
  console.log(`  ${cls}/${region}/${def.asset}: ${etfs.length} ETF candidates → ${me.length} live, ${mfs.length} fund candidates → ${mm.length} live`);
}
for (const d of INDIA) await fromSchemes(d, 'india', d.cls);
for (const d of FEEDERS) await fromSchemes(d, 'us', 'equity');
// The feeder search also finds Indian ETFs and index funds tracking US indices: for the US region
// they belong in one list ("Indian funds"), so fold the ETF node into the MF node.
for (const [k, n] of [...nodes]) if (n.region === 'us' && n.class === 'equity' && n.vehicle === 'etf' && !n.listing) {
  const target = node('equity', 'us', 'mf', null, n.asset);
  target.instruments.push(...n.instruments); nodes.delete(k);
  const seen = new Set(); target.instruments = target.instruments.filter((i) => (seen.has(i.id) ? false : seen.add(i.id))).sort((a, b) => a.inception.localeCompare(b.inception)).slice(0, KEEP);
}

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
for (const i of INDICES) {
  const n = node(i.cls, i.region, 'index', null, i.asset);
  n.instruments.push({ id: `idx-${++seq}`, name: i.name, inception: i.since || null, dateSource: i.since ? 'publisher' : null, ccy: i.ccy, returnType: i.ret || 'Total return', how: i.how, kind: 'Index', links: i.links });
}

// Oldest first; instruments without a known date go last. Keep the top KEEP.
const byAge = (a, b) => (a.inception && b.inception ? a.inception.localeCompare(b.inception) : a.inception ? -1 : b.inception ? 1 : 0);
const list = [...nodes.values()].map((n) => ({ ...n, instruments: n.instruments.sort(byAge).slice(0, KEEP) })).filter((n) => n.instruments.length);

await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), keep: KEEP, nodes: list }, null, 1));
console.log(`\nWrote ${list.length} leaves, ${list.reduce((s, n) => s + n.instruments.length, 0)} instruments → src/portfolio-engine/tree.json`);
