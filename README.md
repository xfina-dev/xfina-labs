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

Push to `main`. GitHub Actions builds with Vite and publishes to GitHub Pages; `public/CNAME` binds `labs.xfina.dev`. No other infrastructure.

Adding a tool: create `<tool>/index.html`, then register it in `vite.config.ts`.
