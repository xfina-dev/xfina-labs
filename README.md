# xfina-labs

Experimental finance tools at [labs.xfina.dev](https://labs.xfina.dev). Static, client-side only: user data stays in the browser.

| Tool | Path | Status |
|---|---|---|
| Multi-asset portfolio backtester (bring your own data) | `/backtest/` | design mock |

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

Adding a tool: create `<tool>/index.html` and `main.js` (mount a component inside `AppShell`), register it in `vite.config.js`, and add it to `TOOLS` in `AppHeader.vue`.
