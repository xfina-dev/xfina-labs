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

**Terms of use.** A bookmarklet automates what a person can do by hand on a site, and site terms can restrict that. Before adding one for a site, read its terms and record the result here. A bookmarklet must stay user-initiated (one dataset per click, in the user's own browser and session), work within the site's own limits, never evade blocks or CAPTCHAs, and never send data to Xfina or host it. The guide card carries a plain disclosure: not affiliated, personal non-commercial use, the site's terms apply, download by hand instead if in doubt.

| Site | Terms reviewed | Result |
|---|---|---|
| NSE Indices (niftyindices.com) | 2026-09-26 | Personal, non-commercial use only. Restricts "systematic or automated data collection" and copying or republishing content without written consent. Automation is therefore a terms question; the guide says so. Index Licensing and Data Subscription exist for commercial use. |

Comparable open-source projects that do this against NSE for years include jugaad-data, nsepy, nsepython and NSEDownload; I found no takedown or legal notice against them, only IP blocking of heavy scrapers. That is not a guarantee. If Xfina Labs ever becomes commercial, revisit this.

One readable script per site in `src/portfolio-engine/bookmarklets/`, registered in `bookmarklets.js` by the website name the download list groups by. `bookmarklet.js` turns a script into the `javascript:` link. They call the sites' own, undocumented data endpoints, so when a site changes, its one script is what to fix. **A bookmarklet never reshapes data.** It gets the file the source itself provides: it drives the site's own form and presses the site's own download button, so the file is exactly what a manual download gives, named by the site. Xfina's importer reads each source's format, so there is no Xfina file format to maintain. Where a site caps how much one download returns, try the largest range it accepts so the data arrives in a single go, and only fall back to several files (the importer merges pieces by date) when it will not. If a site has no download button but serves the data from an endpoint, save that raw response unmodified.

The bookmarklet paces itself gently (a few seconds between files). One bookmark per site works through every dataset the user added, one after another, with one progress bar. It has to run in the foreground tab: browsers pause background tabs, and NSE Indices' page does not load results in a hidden one, so parallel tabs do not work. Where a run starts is chosen in the card (current financial year by default, previous, full history or a date) and is worked out when the bookmark is clicked, so a repeat run covers whatever is current then; the importer lets newer files replace older data for the same dates.

One readable script per site in `src/portfolio-engine/bookmarklets/`, registered in `bookmarklets.js` by the website name the download list groups by. `bookmarklet.js` turns a script into the `javascript:` link. They call the sites' own, undocumented data endpoints, so when a site changes, its one script is what to fix. **A bookmarklet never reshapes data.** It saves what the source published: the site's own download file, or failing that the raw response of the site's own data endpoint, byte for byte. Xfina's importer reads each source's format, so there is no Xfina file format to maintain, and the file's hash is the provider's. Where a site caps how much one request or one download returns, try the largest range it accepts so the data arrives in a single go, and only fall back to several files (the importer merges pieces by date) when it will not.

The bookmark is generated from the datasets the user added to their download list and the card's settings (`__NAME__` tokens in the script are replaced with JSON when the link is built). Currently: `nse-indices.js` (Nifty 50, Next 50, Midcap 150, Smallcap 250 Total Returns Index). NSE Indices' page refuses a range longer than a year (more than 365 days between the two dates), so it downloads one CSV per financial year (April to March, the default) or per calendar year, from the index's start date. A whole year always fits, leap years included. The browser decides where the files are saved.

Scope: equity is index funds and index ETFs only; gold, liquid and gilt are included as well.

Adding a tool: create `<tool>/index.html` and `main.js` (mount a component inside `AppShell`), register it in `vite.config.js`, and add it to `TOOLS` in `AppHeader.vue`.
