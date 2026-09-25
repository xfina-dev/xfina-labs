# xfina-labs

Experimental finance tools at [labs.xfina.dev](https://labs.xfina.dev). Static, client-side only: user data stays in the browser.

| Tool | Path | Status |
|---|---|---|
| Multi-asset portfolio backtester (bring your own data) | `/backtest/` | placeholder |

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

Adding a tool: create `<tool>/index.html`, then register it in `vite.config.ts`.
