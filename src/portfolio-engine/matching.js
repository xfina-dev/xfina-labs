// Which asset in the catalogue an imported file belongs to.
//
// The publishers identify an instrument in their own terms -- an exchange
// symbol, an AMFI scheme name, an index name -- so the match is tried in order
// of how much it proves, and the first pass that is sure of itself wins.
//
// What a match decides, and what it does not: it decides which asset a file is
// filed under. It never decides what the series contains. Every value, date and
// label comes from the file itself (`report.name`, and the parsed rows), so
// matching the ICICI gilt fund's Regular plan against its Direct entry would
// not put Direct's NAVs into a run -- both are the same asset, Long duration,
// and the file's own numbers are what the run reads. That is why the passes
// below ask only one question of several candidates: do they agree on the
// asset? Where they do, the answer is exact however many of them there are;
// where they do not, there is nothing to pick between and the file stays
// unmatched, saying which entries it could have been.
//
// The catalogue is passed in rather than imported, so this is testable on its
// own: `catalogue(nodes)` once, then `matchAsset(report, cat)` per file.

export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const words = (s) => norm(s).split(' ').filter(Boolean);

// Every word of one name appears in the other's. AMFI's export names a scheme
// with less than the catalogue spells out -- "ICICI Prudential Gilt Fund -
// Growth" for "ICICI Prudential Gilt Fund - Regular Plan - Growth" -- and the
// qualifier that differs sits in the middle, where no substring test can see
// it. This is the one rule that catches that, and it is deliberately the only
// copy of it: the same comparison written twice is what let the catalogue and
// the guide disagree about whether a file was in hand.
const subsetOf = (give, have) => give.length > 0 && give.every((w) => have.has(w));

/// How an imported series' name sits against a catalogue entry's:
///
/// - `'exact'`: the same name, or one spells out more around the other. Two
///   entries cannot both be it.
/// - `'scheme'`: every word the file gives appears in the entry. This is the
///   AMFI case above, and it CANNOT tell two plans of one fund apart: the file
///   names the scheme, and both plans share it.
/// - `null`: different instruments.
export function nameFit(got, want) {
  const g = norm(got), w = norm(want);
  if (!g || !w) return null;
  if (g === w) return 'exact';
  // One name inside the other, on word boundaries. Raw substrings would make
  // `NDX` a fit for `Nasdaq-100 Total Return (XNDX)`, and a short ticker is
  // inside a longer one often enough to matter: both Nasdaq entries are the
  // same asset, so nothing showed, but the two are not the same instrument.
  const run = (x) => ` ${x} `;
  if (run(w).includes(run(g)) || run(g).includes(run(w))) return 'exact';
  return subsetOf(words(g), new Set(words(w))) ? 'scheme' : null;
}

/// Flattens the catalogue tree once into what the passes below read.
///
/// An instrument is matched on every name it is published under, not only on
/// the one the catalogue lists it by. Some entries are named descriptively --
/// `NSE short-duration debt index (Liquid or 1D Rate)` -- while the file a user
/// downloads calls itself `NIFTY 1D RATE INDEX`, which shares no identifying
/// word with it, so no comparison of the two can succeed. Those other names are
/// `aliases` on the instrument in tree.json, written by scripts/build-tree.mjs,
/// and they go through exactly the same passes as the catalogue's own name: the
/// next publisher who names something differently is a line of data, not a
/// change here.
export function catalogue(nodes) {
  const instruments = nodes.flatMap((n) =>
    n.instruments.map((i) => ({
      assetKey: `${n.region}|${n.class}|${n.asset}`,
      /// The catalogue's own id for this instrument (`mf100369`, `etf-gld`,
      /// `idx-nifty-50-tri`). This is what a Datasets row is keyed by, and it
      /// is NOT the asset id from identity.js: one asset holds many
      /// instruments.
      id: i.id,
      asset: n.asset,
      vehicle: n.vehicle,
      // The first date this instrument can have a value for. A file that
      // starts earlier is not it, whatever its name says, which is what tells
      // a fund's Regular plan from the Direct plan opened years later.
      inception: i.inception ?? null,
      // The sites this instrument can be downloaded from, used only to tell
      // two candidates apart.
      hows: [i.how, ...((i.alts ?? []).map((a) => a.how))].filter(Boolean),
      code: i.code ? norm(i.code) : null,
      name: norm(i.name),
      label: i.name,
      // Every name this instrument answers to, the catalogue's and the
      // publishers', each with its words for the subset pass.
      // `alias: true` marks a name some publisher actually prints, as against
      // the catalogue's own label: an alias is recorded because a file says
      // exactly that, so it identifies an instrument the way a code does.
      names: [{ text: i.name, alias: false }, ...(i.aliases ?? []).map((text) => ({ text, alias: true }))]
        .map(({ text, alias }) => ({ name: norm(text), words: new Set(words(text)), alias })),
      words: new Set(words(i.name)),
      kind: i.kind,
    })),
  );
  // An index file names the index, not an instrument, so the asset's own name
  // is a match too ("NIFTY 50" → Nifty 50).
  const assets = [...new Map(nodes.map((n) => {
    const assetKey = `${n.region}|${n.class}|${n.asset}`;
    return [assetKey, { assetKey, asset: n.asset, name: norm(n.asset) }];
  })).values()];
  return { instruments, assets };
}

// One asset among the candidates, when they agree on one.
function agreed(candidates) {
  const keys = [...new Set(candidates.map((i) => i.assetKey))];
  return keys.length === 1 ? keys[0] : null;
}

/// Which asset a parsed file belongs to: `{ assetKey, how }`, or
/// `{ ambiguous, assets }` when a pass found entries that do not agree on one
/// and no later pass did better, or `null` when nothing in the catalogue fits.
export function matchAsset(report, cat) {
  const { instruments, assets } = cat;
  const code = norm(report.code);
  const name = norm(report.name || report.code);
  // A pass that finds candidates spanning several assets has nothing to pick
  // between, but it must not end the search either: a later, more specific pass
  // may still be sure. So the disagreement is kept, and only reported if
  // nothing below settles it -- "Gold" matches a dozen instruments across three
  // regions, and is still exactly the India gold asset's own name.
  let unsure = null;
  const tried = (candidates, how) => {
    if (!candidates.length) return null;
    const key = agreed(candidates);
    if (key) return { assetKey: key, how };
    unsure ??= { ambiguous: candidates.map((i) => i.label), assets: [...new Set(candidates.map((i) => i.assetKey))] };
    return null;
  };

  // An exchange symbol or a scheme code: the publisher's own identifier.
  if (code) {
    const hit = tried(instruments.filter((i) => i.code && i.code === code), 'symbol');
    if (hit) return hit;
  }
  // The instrument's full name, either way round: a file may print more around
  // the name than the catalogue holds, or less.
  for (const text of [name, code]) {
    if (!text) continue;
    const hit = tried(instruments.filter((i) => i.names.some((n) => nameFit(text, n.name) === 'exact')), 'name');
    if (hit) return hit;
  }
  // An index: match the asset's own name, longest first, so "Nifty Next 50"
  // wins over "Nifty 50" for a file that names both.
  const candidates = [...assets].sort((a, b) => b.name.length - a.name.length);
  for (const text of [name, code]) {
    if (!text) continue;
    const hit = candidates.find((a) => text === a.name || text.includes(a.name));
    if (hit) return { assetKey: hit.assetKey, how: 'index name' };
  }
  // A pass on words, for a file whose name carries the index with the
  // publisher's own wording around it.
  const bag = new Set([...words(name), ...words(code), ...words(report.filename)]);
  const byWords = candidates.find((a) => words(a.name).every((w) => bag.has(w)));
  if (byWords) return { assetKey: byWords.assetKey, how: 'filename' };

  // Last: a scheme named with less than the catalogue spells out. AMFI's export
  // prints the scheme without its plan -- "ICICI Prudential Gilt Fund - Growth"
  // for what the catalogue calls "ICICI Prudential Gilt Fund - Regular Plan -
  // Growth" -- and an interior qualifier like that is in neither string's
  // substrings, so none of the passes above can see it. Every word the file
  // gives must appear in the entry, which leaves both the Regular and the
  // Direct entry standing; they are the same asset, so the asset is certain
  // even though the plan is not. Where such candidates are NOT one asset, the
  // file stays unmatched and names them.
  const given = [...new Set(words(name))];
  if (given.length) {
    const hit = tried(instruments.filter((i) => i.names.some((n) => subsetOf(given, n.words))), 'scheme name');
    if (hit) return hit;
  }
  return unsure;
}

// --- One instrument -----------------------------------------------------------
// Which publisher a file came from, as `xfina` names the format, against the
// `how` the catalogue downloads an instrument by. Written out because there is
// nothing to derive it from: the two vocabularies are different libraries'.
// Used only to tell two otherwise equal candidates apart, never to rule a
// candidate out -- a user may download a dataset from a site the catalogue does
// not document for it.
const SOURCE_HOW = {
  'md-nse-indices': 'nseTri',
  'md-nse-security': 'nseEtf',
  'md-amfi-nav': 'amfi',
  'md-mcx-spot': 'mcxSpot',
  'md-tiingo': 'tiingo',
  'md-wsj': 'wsj',
  'md-yahoo': 'yahoo',
  'md-ishares': 'ishares',
  'md-spdr-gold': 'spdrgold',
  'md-msci': 'msci',
  'md-nasdaq': 'nasdaqIndex',
};

/// Which catalogue instrument a file is, as far as the file can say.
///
/// `matchAsset` answers which asset a file belongs to, which is all a run
/// needs. A Datasets row is one instrument, so it needs more: this narrows the
/// asset's instruments to the ones the file's own name or code fits, and uses
/// the publisher only to separate two that are otherwise equal.
///
/// Returns the asset's answer, plus either `dataset` (one instrument, certain)
/// or `candidates` (several, and the file does not say which). The second is
/// not a failure: AMFI's NAV export names the scheme without its plan, so a
/// file of the ICICI gilt fund genuinely cannot say whether it is the Regular
/// or the Direct plan. Every other publisher in the catalogue names its
/// instrument exactly.
export function matchDataset(report, cat) {
  const asset = matchAsset(report, cat);
  if (!asset?.assetKey) return asset;
  const mine = cat.instruments.filter((i) => i.assetKey === asset.assetKey);
  const code = norm(report.code);
  const name = norm(report.name || report.code);
  // A code is an identifier and a name is a description, so they are not equal
  // evidence: an exchange symbol the file prints resolves an instrument on its
  // own, while a name that merely fits has to agree with where the file came
  // from. Quantum's gold fund-of-funds NAV, from AMFI, fits the name of the
  // Quantum gold ETF listed on NSE -- same asset, different instrument, and
  // only the publisher tells them apart.
  // Identifier-strength: the publisher's own code, or a name recorded as one an
  // instrument is published under (Yahoo names the Swisscanto gold ETF
  // `ZGLDUS.SW`, which is why that alias is there).
  const named = (i, only) => i.names.some((n) => (only ? n.alias : true)
    && [name, code].some((text) => text && nameFit(text, n.name) === 'exact'));
  const byCode = mine.filter((i) => (i.code && (i.code === code || i.code === name)) || named(i, true));
  if (byCode.length === 1) return { ...asset, dataset: byCode[0].id };
  if (byCode.length > 1) {
    const could = byCode.filter(existed);
    if (could.length === 1) return { ...asset, dataset: could[0].id };
  }
  const how = SOURCE_HOW[report.source];
  const published = (i) => !how || !i.hows.length || i.hows.includes(how);
  // An instrument has no values before it existed, so a file that starts
  // earlier is not that instrument. This is what separates a fund's plans where
  // the name cannot: the ICICI gilt fund's Regular plan opens 2006-04-02 and
  // its Direct plan 2013-01-02, so a file starting in 2006 is the Regular one.
  const existed = (i) => !i.inception || !report.from || report.from >= i.inception;
  const fits = mine.filter((i) => i.names.some((n) => [name, code].some((text) => text && nameFit(text, n.name))));
  let left = (byCode.length ? byCode : fits).filter((i) => published(i) && existed(i));
  // Nothing of this asset is published where the file came from: the asset is
  // still right, the instrument is not established.
  if (!left.length) return { ...asset, candidates: (fits.length ? fits : mine).map((i) => i.id) };
  if (left.length === 1) return { ...asset, dataset: left[0].id };
  return { ...asset, candidates: left.map((i) => i.id) };
}
