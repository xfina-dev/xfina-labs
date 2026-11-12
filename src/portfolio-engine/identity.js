// What identifies an asset.
//
// Three of the catalogue's assets share a name across regions -- Gold is an
// asset in India, the US and Global alike, and Short duration and Long duration
// are both India and US -- so a name is not an identity. Keying anything by one
// makes those assets the same asset: a band set on India Gold moved US Gold
// with it, hiding one Gold's drift line hid all three, and a CSV came out with
// two columns of the same name.
//
// So an asset is identified by its region and its name together, written
// `in:Gold`. It is one helper and every lookup, map, `:key` and column heading
// goes through it, because the way to have two identities drift apart is to
// write the second one out by hand somewhere.
//
// This is identity, not a label: the page still shows `Gold`, with the region
// tab and the chart colour giving the context.
//
// It is derived, never stored. What is stored keeps the format it has always
// had -- imports under `region|class|asset` in IndexedDB, the saved allocation
// under `Region|asset` -- so a browser that already holds files and run history
// reads them back unchanged.

// The region codes, in one place.
const CODES = { india: 'in', us: 'us', global: 'gl' };
// A region arrives either as its catalogue id (`india`) or as the tab's title
// (`India`), depending on which side of the page is asking.
const CODE_BY_TITLE = Object.fromEntries(Object.entries(CODES).map(([id, code]) => [id.toLowerCase(), code]));

/// The two-letter code for a region, by id or by title (`india`, `India`).
export function regionCode(region) {
  const key = String(region ?? '').toLowerCase();
  return CODE_BY_TITLE[key] ?? key.slice(0, 2);
}

/// What identifies an asset: `in:Gold`, `us:Short duration`.
export const assetId = (region, asset) => `${regionCode(region)}:${asset}`;

/// The id of an asset the catalogue names by key (`india|debt|Short duration`).
export function idOfKey(key) {
  const [region, , ...asset] = String(key ?? '').split('|');
  return assetId(region, asset.join('|'));
}

/// A run's asset, as its results refer to it. Runs saved before assets carried
/// an id have only their name, and must keep working: the name is the fallback,
/// and with it such a run behaves exactly as it did when it was saved.
export const idOf = (asset) => asset?.id ?? asset?.name ?? '';
