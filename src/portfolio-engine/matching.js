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
  if (g === w || g.includes(w) || w.includes(g)) return 'exact';
  return subsetOf(words(g), new Set(words(w))) ? 'scheme' : null;
}

/// Flattens the catalogue tree once into what the passes below read.
export function catalogue(nodes) {
  const instruments = nodes.flatMap((n) =>
    n.instruments.map((i) => ({
      assetKey: `${n.region}|${n.class}|${n.asset}`,
      asset: n.asset,
      vehicle: n.vehicle,
      code: i.code ? norm(i.code) : null,
      name: norm(i.name),
      label: i.name,
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
    const hit = tried(instruments.filter((i) => i.name === text || i.name.includes(text) || text.includes(i.name)), 'name');
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
    const hit = tried(instruments.filter((i) => subsetOf(given, i.words)), 'scheme name');
    if (hit) return hit;
  }
  return unsure;
}
