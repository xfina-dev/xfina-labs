// The catalogue as both screens read it: region, then asset, with whatever this
// browser holds for each.
//
// Written once because two screens show the same thing about the same
// catalogue. The Assets step picks a series per asset; the Series screen's
// Manage stage shows what is held per asset. Two shapes for that would be two
// things to keep in step, and a grouping that drifts is how a screen starts
// looking like a different app.
//
// `series` is a getter, so a file imported anywhere shows up here without the
// catalogue being rebuilt.
import { CLASSES, REGIONS, nodes } from './guide.js';
import { seriesFor } from './imports.js';

/// What an asset is called on a screen that already says which region it is in:
/// the class where it tells two apart (`Debt · Short duration`), the asset's own
/// name otherwise. Regions mix elsewhere -- the allocation, the results -- and
/// there the region-qualified name from identity.js is what to use instead.
export const assetName = (cls, asset) => (cls === 'debt' ? `Debt · ${asset}` : asset);

/// Every region, with its assets in catalogue order.
export function regionsWithAssets() {
  return REGIONS.map((r) => ({
    id: r.id,
    title: r.title,
    assets: CLASSES.flatMap((c) => [...new Set(nodes.filter((n) => n.region === r.id && n.class === c.id).map((n) => n.asset))].map((asset) => {
      const key = `${r.id}|${c.id}|${asset}`;
      return {
        key,
        name: assetName(c.id, asset),
        // The longest history any of this asset's datasets has, which is what a
        // screen measures what is held against.
        since: nodes.filter((n) => n.region === r.id && n.class === c.id && n.asset === asset)
          .flatMap((n) => n.instruments.map((i) => i.inception)).filter(Boolean).sort()[0],
        get series() { return seriesFor(key); },
      };
    })),
  }));
}
