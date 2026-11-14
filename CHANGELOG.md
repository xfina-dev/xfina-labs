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

### Changed

- An asset is identified by its region and its name together -- `in:Gold`,
  `us:Short duration` -- rather than by its name. Three of the catalogue's
  assets share a name across regions, so a name was never an identity, and
  identity was being taken from a label that exists to be read. One helper
  (`identity.js`) produces it and every map, `:key`, band override, drift series
  and CSV heading goes through it; the page still shows `Gold`, with the region
  tab and the chart colour giving the context. Nothing stored changes format, so
  files and run history already in a browser read back unchanged, and a run
  saved before assets carried an id falls back to its name and charts as it did.

### Fixed

- A band of its own, set on one asset under Threshold rebalancing, was applied
  to the wrong asset -- and only when exactly one asset had one. The engine took
  a band by its position in the map it arrived in, so a second own band made
  both assets fall back to the shared band, and a single one was applied to
  whichever asset sorted first. Bands are now looked up by the asset's id, so
  one belongs to the asset it was set on, several work together, and one left
  over from an asset that is no longer picked is dropped instead of appearing to
  do something.

### Changed

- Select Assets no longer offers `Get` for a dataset whose site only serves its
  data to a page on that site: those come down with the bookmark in How to get
  data, so a link to a download section led nowhere. The `To download` badge and
  the row stay, as the pick is still outstanding. The Download icon on a region's
  tab now counts only what is left to fetch by hand, so it does not advertise a
  download with nothing to click, and the footer line says "to bring down with
  their bookmarks and import" when every outstanding pick comes that way. Which
  sources those are is derived from the bookmarklets themselves
  (`hasBookmarklet` in `bookmarklets.js`), not listed, so it stays right as
  bookmarklets are added or removed: today AMFI, NSE, NSE Indices, MCX, Tiingo
  and WSJ.

### Changed

- What was chosen in Choose is kept beside the files, in this browser's own
  store, instead of in `localStorage`. The picks and the files used to live in
  two stores with no key in common, which is why the app reconciled them by
  comparing names as it drew; the names went when a file started recording its
  catalogue instrument, and this puts the two halves in one place. The old key
  is read once and then left exactly where it is, so an earlier version of the
  app still finds its picks, and a pick naming a dataset the catalogue no longer
  has is dropped quietly rather than showing a row for something that is not
  there. The database upgrade only adds a store: imported files and run history
  are untouched by it, and a failure part way leaves the picks unmigrated rather
  than losing anything.
- The Portfolio Engine's first step is **Series**, and only picks what a run
  reads: one loaded series per asset, the reference series this run converts
  with and deflates by, and the period they make. Importing, downloading, what
  was read but matched nothing, and the storage this browser is using have all
  moved to Datasets, with a line and a link where something is missing.
- Which USD/INR and which CPI series a run uses stays with the run. Those are a
  choice between the one to prefer and one with a longer history, and it changes
  what a run reports -- the FX pick rescales every dollar asset, the CPI pick
  drives every Real figure -- so it belongs where the run is set up, beside the
  per-asset pick. What Datasets owns is the provision: that they exist, who
  publishes them, what each covers and why the long-history one is there.
- Where a run starts before the preferred reference series covers, the pick says
  so: "Your run starts 2005-04-01, before SBI forex card covers (2020-01-06).
  BIS USD/INR goes back further." Nothing switches on its own.

### Added

- Choose and Get are on Datasets now, so the whole job is one screen: the
  wizard, every asset for the path it leads to, the per-site download steps, the
  bookmarklets and each publisher's terms, all moved whole -- the notes about a
  publisher's limits (NSE one financial year per request, AMFI five years at a
  time) are what this tool knows, and none of it changed in the move. The old
  `/portfolio-engine/get-data/` URL redirects to the new screen and carries the
  wizard's path with it, so a bookmark still lands where it meant to.
- Where a file cannot say which instrument it is, Datasets asks once and
  remembers. AMFI's NAV export names a scheme without its plan, so a file of the
  ICICI gilt fund covering only recent months could be the Regular plan or the
  Direct one; the dates settle it where the plans began at different times, and
  where they do not the row offers the candidates and keeps the answer against
  the file. One answer covers every file of that series, including ones imported
  later, and it survives the file being re-read. An unresolved file is still
  usable in a run -- the asset is certain even when the instrument is not -- and
  it is only the Datasets row that waits. Where the files argue with the answer,
  starting before the plan that was chosen existed, the row says so.
- **Datasets**, a screen of its own at `/portfolio-engine/datasets/`, where
  getting data happens end to end: choose what you want, download it from the
  publisher, import the files, and see what this browser holds. Import and Hold
  are there now -- a drop area, and one row per dataset with the catalogue
  instrument it resolved to, what it covers, its files and its checks, plus
  anything read but unmatched and the storage this browser is using. Choose and
  Get still live in How to get data and move across next. The screen draws
  entirely from the stored metadata, so opening it fetches no WebAssembly.

### Changed

- An imported file records what it is when it arrives -- which asset it belongs
  to and, where the file says so, which catalogue instrument -- instead of the
  page working that out by comparing names each time it drew. The picks made in
  How to get data and the files in this browser had no shared key, so the two
  were reconciled by name at display time, and that one decision is behind most
  of the recent crop of bugs: the scheme name whose plan sits in the middle, the
  `To download` badge that would not clear, the Regular-versus-Direct ambiguity.
  The comparison is gone rather than ported. A stored match is re-made only when
  the file is read by a newer parser or the catalogue changes, neither of which
  happens while a screen is being drawn.

### Fixed

- An index published under a name the catalogue does not use went unmatched.
  NSE calls its overnight-rate index `NIFTY 1D RATE INDEX`, which is what a
  download says; the catalogue lists it descriptively as `NSE short-duration
  debt index (Liquid or 1D Rate)`. The two share no identifying word, so every
  pass failed and seventeen files of good history filed under nothing. An
  instrument now carries `aliases` -- the other names it is published under --
  written by `scripts/build-tree.mjs` and matched by exactly the same rules as
  the catalogue's own name, so the next publisher whose naming differs is a line
  of data rather than a change to the matcher. Three entries have them: the two
  NSE debt indexes (the G-Sec one matched only because its name happens to
  contain what NSE prints, which renaming it would have broken silently) and the
  Swisscanto gold ETF, whose Yahoo symbol carries a market suffix (`ZGLDUS.SW`)
  the catalogue's `ZGLDUS` did not match.
- A file was refused outright when a publisher's own cross-check did not
  reconcile, which blocked the asset. iShares' 0–1 Year Treasury Bond ETF came
  back Invalid over 48 distributions of **zero**, declared through 2021–22 when
  a fund of one-year treasuries paid nothing: its Distributions sheet lists them
  as 0 and its price history prints 0 against the same dates, so the file is
  exactly consistent -- but a zero is not stored as a dividend, so the check
  counted them as missing. A backtest reads one thing from a file, the value
  path, and whether the publisher's bookkeeping ties out says nothing about
  whether that path is sound. Such a check is now a note carrying its own
  numbers ("the file says 238, its rows give 190 (48 out)") for the user to
  judge. What still makes a file unusable is decided on the series itself: no
  values at all, or a scale break in the path (an unrecorded split).
- Select Assets went on showing `To download` for a fund whose files were
  already imported. The badge kept its own copy of the name comparison, which
  still failed on AMFI's shortened scheme names after the matcher stopped doing
  so, so it claimed the gilt files had not arrived. There is now one rule, in
  `matching.js`, and both callers use it. Where a file's name cannot tell two
  plans of one fund apart, two things settle it: a fund has no NAVs before it
  existed, so a series starting before a plan's inception is not that plan; and
  if a file still fits two picked datasets, neither is counted as held and the
  rows say why, rather than reporting data that may not be in hand.
- Three AMFI gilt NAV files read fine but landed in "not matched to an asset",
  under a fund the catalogue lists. AMFI's export names the scheme
  `ICICI Prudential Gilt Fund - Growth`; the catalogue spells it
  `ICICI Prudential Gilt Fund - Regular Plan - Growth`. The missing qualifier is
  in the middle, so neither name contains the other and no pass could see it. A
  last pass now matches a scheme named with less than the catalogue spells out:
  every word the file gives must appear in the entry, which leaves the fund's
  Regular and Direct entries standing -- and since both are the same asset, the
  asset is certain even though the plan is not. A match names an asset, never an
  instrument, and every value a run reads comes from the file, so two plans
  standing together cannot put the wrong NAVs into a backtest. Where candidates
  do not agree on one asset, the file stays unmatched and Select Assets names
  the entries it could have been, rather than silently taking the first.
- The allocation and drift charts drew a saved result against whatever Select
  Assets happens to be set to now, rather than against the assets the run was
  made with. They read the live catalogue straight from `allocation.js` and
  indexed each row by it. While the two agreed, nothing showed; once imports
  persisted, a stored run could be viewed against a different selection -- after
  a reload, or just by ticking an asset without running again. With fewer picks
  than the run had, a series went missing and the colours shifted; with more,
  every row was read past its end, and one undefined value turned the whole
  scale into `NaN`, so the drift chart drew nothing at all. Both charts now take
  the run's own assets, in the order its rows are in, and a chart handed series
  that do not line up says so on its face instead of coming up blank.
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
