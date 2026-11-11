// What the per-asset charts need before they can draw a stored result.
//
// A result carries its own assets: the ones the run was made with, in the order
// its weight and drift rows are in. The charts must take those, as a prop, and
// never the live `ASSETS` from allocation.js, which is the current Select
// Assets picks and changes under them. Drawing a saved result against the
// current picks silently mismatched the series -- a line short, the colours
// shifted -- or, when there were more picks than the run had assets, read past
// the end of every row: one `undefined` turns the whole scale into NaN and an
// SVG of NaN coordinates draws nothing at all.
//
// So the charts take their assets as a prop, keep NaN out of the scale, and say
// so when the two do not line up, which should now be impossible.

/// Why this chart cannot be drawn, or '' when it can. `counts` is the number of
/// values each row carries.
export function seriesMismatch(counts, assets) {
  const want = assets.length;
  const bad = counts.find((n) => n !== want);
  return bad === undefined ? '' : `This result has ${bad} assets and the chart was given ${want}.`;
}

/// Only real numbers set a chart's scale: one undefined among them would make
/// every bound NaN.
export const finite = (xs) => xs.filter((x) => Number.isFinite(x));
