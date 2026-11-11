# Changelog

All notable changes to Xfina Labs. The site deploys from `main`, so a change is
live as soon as it lands; the dates below are when it did.

## Unreleased

### Added

- **The Portfolio Engine runs on real data.** A new Rust crate, `engine/`, built
  to WebAssembly, composes [`xfina`](https://github.com/xfina-dev/xfina) (which
  reads each publisher's download into a price series) and
  [`xfingine`](https://github.com/xfina-dev/xfingine) (the computation). The
  design mock's `mockData.js` and `resultsData.js` are gone: every figure in the
  results, and in the CSV, JSON and PNG exports, now comes from the files the
  user imported. Run history and comparison carry the engine's own results.
- **Imports are kept in this browser.** Files survive a reload: their metadata
  and their raw bytes are stored in IndexedDB (`vault.js`), in two stores. A
  reload draws the import table and the run history from the metadata alone,
  without loading the WebAssembly module at all; the bytes go into the module
  only when a run needs a series it does not hold. The four steps' settings --
  which series each asset uses, the weights, the plan and the rebalancing rules
  -- are kept alongside them, so a reload comes back to the same setup.
  Select Assets says how much is stored and lets it all be deleted; deleting a
  file deletes its bytes with it. Nothing is uploaded, and nothing leaves the
  browser.
- **Checks that a backtest actually needs.** A file whose values jump by a round
  multiple with no split recorded against it -- a fund that splits its units ten
  for one, which AMFI's export does not mark -- is rejected with the date and
  the ratio, rather than silently producing a 90% fall. Any other move beyond a
  quarter in a day is flagged for a second look, as is a date a file gives more
  than one value for. A publisher that polls, such as MCX, is not caught by the
  last of these: several readings a day is what its series is.

### Fixed

- A plan whose first contribution falls after the run's first year-end -- a
  savings rate starting at 0% with no lumpsum -- showed that year as an
  allocation of nothing: every asset its whole target below target, and, because
  total drift was taken as the sum of the overweights and nothing was overweight,
  a total drift of 0%. The one row with no portfolio in it read as the
  best-behaved row in the table, in the drift chart, the table and the CSV
  alike. Allocation and drift now begin at the first month the portfolio held
  something, and say which month that is; the x axis counts from there. Total
  drift is now half the sum of the absolute drifts, the same figure whenever the
  weights total 100% but one that cannot report a portfolio far from its targets
  as being at them. A year before the first rupee also showed its multiple of
  what went in as `NaN×`; it now shows nothing.
- Checking whether a stored reading of a file is still current no longer loads
  the WebAssembly module to ask. It is answered against the build the page last
  saw, so a reload stays free of the engine, which was the point of keeping the
  metadata apart from the bytes; a build that reads files differently is noticed
  the first time the module loads for some other reason.
- Unticking an asset in one region unticked it in the others. `Gold` is an asset
  in India, the US and Global alike, and the pick was kept under its name.
- A reference series that covers none of the run no longer falls back to the
  shortest history available. Picking the first in the list quietly cut a
  hundred-year index down to the six years the newest rate sheet covers.
- Picks that share no dates at all -- a fund whose history ended before
  another's began -- said "−11.0 years" and ran anyway. Select Assets now says
  which two series clash, and Run says there is no period.
- A series from a publisher that quotes several markets and prints no currency
  (Tiingo, WSJ, Yahoo) was treated as rupees. It now takes the currency of the
  region its asset is in, and says that it assumed one.
- The contribution window no longer sticks to a period that has since moved:
  until a month is set by hand, it is the run's own.
