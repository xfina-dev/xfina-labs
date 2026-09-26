# xfina-labs

Experimental finance tools at [labs.xfina.dev](https://labs.xfina.dev). Static, client-side only: user data stays in the browser.

| Tool | Path | Status |
|---|---|---|
| Portfolio Engine: multi-asset portfolio backtesting (bring your own data) | `/portfolio-engine/` | design mock |
| Data guide: where to download each dataset and the file format | `/portfolio-engine/get-data/` | design mock |

## Stack and theme

Vue 3 + Tailwind 3 + shadcn-vue, the same stack as [Xfina](https://github.com/xfina-dev/xfina) so every xfina.dev subdomain looks identical.

Copied verbatim from `xfina/web`: `tailwind.config.js`, `postcss.config.js`, `components.json`, `src/style.css` (theme tokens), `src/components/ui/*`, `src/lib/utils.js`. Labs-only additions live in separate files (`src/labs.css`, `src/components/AppShell.vue`, `AppHeader.vue`, `PrivacyDialog.vue`). When Xfina's theme changes, re-copy those files.

## Develop

```bash
npm install
npm run dev
```

## Deploy

Cloudflare, as an assets-only Worker (same pattern as xsteer; all new xfina projects use Cloudflare, only sakthipriyan.com stays on GitHub Pages). One site, one deployment: tools are paths, not separate projects.

- Push to `main` → `.github/workflows/deploy.yml` builds and runs `wrangler deploy` → https://labs.xfina.dev
- `wrangler.jsonc` binds the custom domain; Cloudflare creates the DNS record.
- Repo secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Manual deploy: `npm run build && npx wrangler deploy`

### The data guide's tree

`src/portfolio-engine/tree.json` (asset class → region → vehicle → asset → the three oldest instruments) is generated. Regenerate it with `npm run build:tree`. It needs network and takes a couple of minutes. Where each date comes from:

- Indian funds and ETFs: the first NAV date on AMFI, via mfapi.in. This is the oldest history AMFI holds, which can be later than the fund's real launch.
- iShares ETFs: the inception date on the fund's own page.
- A few others (SPY, VOO, QQQ, VUAA, GLD, BIL, BNDW, EEM): a launch date typed into the script and flagged `manual`. Check these.

### Bookmarklets

Some sites (NSE Indices, NSE) only serve their data to a page on that site, so a page here cannot fetch it. For those the data guide offers a bookmarklet: a script the user drags to the bookmarks bar, clicks while on the site, and which saves the files to their disk. They then import the files in Portfolio Engine. It runs only on that site and sends nothing to Xfina.

**Terms of use.** A bookmarklet automates what a person can do by hand on a site, and site terms can restrict that. Before adding one for a site, read its terms and record the result here. A bookmarklet must stay user-initiated (one dataset per click, in the user's own browser and session), work within the site's own limits, never evade blocks or CAPTCHAs, and never send data to Xfina or host it. The guide card carries a short, plain note: it only saves the clicking, it is for the user's own study, Xfina never sees the data, Xfina is not affiliated with the site, and the site's terms apply as they do to a manual download (with a link).

| Site | Terms reviewed | Result |
|---|---|---|
| NSE Indices (niftyindices.com) | 2026-09-26 | Personal, non-commercial use only. Restricts "systematic or automated data collection" and copying or republishing content without written consent. Automation is therefore a terms question; the guide says so. Index Licensing and Data Subscription exist for commercial use. |

Comparable open-source projects that do this against NSE for years include jugaad-data, nsepy, nsepython and NSEDownload; I found no takedown or legal notice against them, only IP blocking of heavy scrapers. That is not a guarantee. If Xfina Labs ever becomes commercial, revisit this.

One readable script per site in `src/portfolio-engine/bookmarklets/`, registered in `bookmarklets.js` by the website name the download list groups by. `bookmarklet.js` turns a script into the `javascript:` link (`__NAME__` tokens in the script are replaced with JSON when the link is built). They call the sites' own, undocumented data endpoints and page controls, so when a site changes, its one script is what to fix.

**A bookmarklet never reshapes data.** It gets the file the source itself provides: it drives the site's own form and presses the site's own download button, so the file is exactly what a manual download gives, named by the site. Xfina's importer reads each source's format, so there is no Xfina file format to maintain. Where a site caps how much one download returns, use the largest range it accepts and only fall back to several files (the importer merges pieces by date) when it will not. If a site has no download button but serves the data from an endpoint, save that raw response unmodified.

**A bookmark is made once and reused.** It has no dates or settings baked in: it covers every index the site's script supports. On the site it opens a small panel with three modes. *Update* (the default) fetches only what is new: it remembers, per index, the date it last covered (in that site's browser storage) and fetches from two weeks before that to today, and an index it has never done gets its full history, so the first click brings in everything and later clicks bring in the difference. *Full history* redoes everything. *Custom* takes a start and end date. The panel shows the files it will download before Start. It only advances its memory over a contiguous stretch, so a custom range that leaves a hole is not remembered as covered. The importer lets newer files replace older data for the same dates, so the overlap and repeats are harmless. The memory is per browser and per site address: clearing that site's data makes the next Update a full history. NSE serves both `niftyindices.com` and `www.niftyindices.com`, and browser storage is separate for each, so the bookmark always works on the `www` address (clicked on the other one it moves the page there and asks for another click). If the browser blocks storage the panel says so, and Update fetches the full history each time. The link is long (about 18 KB encoded), which the mainstream browsers accept.

**Pacing.** Files go out with a short pause between them, except the first three, which go back to back so the browser's "allow multiple downloads" prompt appears early; the run then waits about 15 seconds (or until the user presses Continue now) before carrying on at the gentler pace. It has to run in the foreground tab: browsers pause background tabs, and NSE Indices' page does not load results in a hidden one, so parallel tabs do not work. Where the browser saves the files is the browser's own setting.

Currently: `nse-indices.js` (Nifty 50, Next 50, Midcap 150, Smallcap 250 Total Returns Index). NSE Indices' page refuses a range longer than a year (more than 365 days between the two dates), so a range of up to a year is one file and a longer one is split into one file per financial year (April to March), the ends partial. A whole financial year always fits, leap years included.

Scope: equity is index funds and index ETFs only; gold, liquid and gilt are included as well.

Adding a tool: create `<tool>/index.html` and `main.js` (mount a component inside `AppShell`), register it in `vite.config.js`, and add it to `TOOLS` in `AppHeader.vue`.
