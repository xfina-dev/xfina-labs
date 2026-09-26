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

One readable script per site in `src/portfolio-engine/bookmarklets/`, registered in `bookmarklets.js` by the website name the download list groups by. `bookmarklet.js` turns a script into the `javascript:` link. They call the sites' own, undocumented data endpoints, so when a site changes, its one script is what to fix. **A bookmarklet never reshapes data.** It gets the file the source itself provides: it drives the site's own form and presses the site's own download button, so the file is exactly what a manual download gives, named by the site. Xfina's importer reads each source's format, so there is no Xfina file format to maintain. Where a site caps how much one download returns, try the largest range it accepts so the data arrives in a single go, and only fall back to several files (the importer merges pieces by date) when it will not. If a site has no download button but serves the data from an endpoint, save that raw response unmodified.

The bookmarklet paces itself like a person (a few seconds between files) and is generated **per dataset**, so each browser tab shows the progress of one and the user can run several tabs side by side.

One readable script per site in `src/portfolio-engine/bookmarklets/`, registered in `bookmarklets.js` by the website name the download list groups by. `bookmarklet.js` turns a script into the `javascript:` link. They call the sites' own, undocumented data endpoints, so when a site changes, its one script is what to fix. **A bookmarklet never reshapes data.** It saves what the source published: the site's own download file, or failing that the raw response of the site's own data endpoint, byte for byte. Xfina's importer reads each source's format, so there is no Xfina file format to maintain, and the file's hash is the provider's. Where a site caps how much one request or one download returns, try the largest range it accepts so the data arrives in a single go, and only fall back to several files (the importer merges pieces by date) when it will not.

One bookmark is generated for each dataset the user added to their download list (`__NAME__` tokens in the script are replaced with JSON when the link is built). Currently: `nse-indices.js` (Nifty 50, Next 50, Midcap 150, Smallcap 250 Total Returns Index). NSE Indices' page refuses a range longer than a year, so it downloads one CSV per year from the index's start date.

Scope: equity is index funds and index ETFs only; gold, liquid and gilt are included as well.

Adding a tool: create `<tool>/index.html` and `main.js` (mount a component inside `AppShell`), register it in `vite.config.js`, and add it to `TOOLS` in `AppHeader.vue`.
