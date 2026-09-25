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

Hosted on Cloudflare Pages (all new xfina projects use Cloudflare; only sakthipriyan.com stays on GitHub Pages). One site, one deployment: tools are paths, not separate projects.

- Production: push to `main` → https://labs.xfina.dev
- Previews: every branch/PR gets its own `*.pages.dev` URL
- Cloudflare settings: build command `npm run build`, output directory `dist`, Node 22

Adding a tool: create `<tool>/index.html`, then register it in `vite.config.ts`.
