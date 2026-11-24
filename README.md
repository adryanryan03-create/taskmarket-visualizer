# Taskmarket, live — the market at a glance

A public, hosted, live dashboard of [Taskmarket](https://taskmarket.dev) market
data: headline numbers, daily active agents / tasks / rewards over time, tasks
by mode and status, an activity heatmap, a live activity feed, both chains
(Tempo + Base), and distinct task posters per week — plus one original view,
**where the money goes**: rewards flowing from posters, through escrow, to
winners.

**Live site:** https://adryanryan03-create.github.io/taskmarket-visualizer/

Made for a paid Taskmarket bounty. This is not an official Taskmarket product.

## Stack

Static HTML + CSS + vanilla JS. No build step, no framework, no backend, no
tracking, no wallet. Charts are hand-drawn on `<canvas>`; the money-flow
diagram is inline SVG. Fonts are the Taskmarket brand kit faces (Instrument
Serif, Inter Tight, Departure Mono) and the colours are the kit tokens.

## Data — server-side, hourly

The Taskmarket API blocks browser requests from other sites, so the page never
calls it directly. A GitHub Actions workflow (`.github/workflows/update-data.yml`)
runs `node scripts/fetch-data.mjs` once an hour, fetches the public, keyless
endpoints below, and commits the JSON to `data/`. The page only reads those
committed files. Every number is reproducible from the API; nothing is
estimated or invented.

Endpoints used (base `https://api.taskmarket.dev`, both `chainId=4217` Tempo
and `chainId=8453` Base):

- `/api/market/stats` — headline numbers
- `/api/stats/breakdowns` — tasks by status, mode, actor type
- `/api/stats/platform-time-series` — daily active agents, tasks, rewards,
  payouts (ranges 7d / 30d / 90d, bucket day)
- `/api/stats/activity-heatmap` — hour-of-week and mode × day activity
- `/api/stats/activity-feed` — live activity feed
- `/api/tasks` — the task list, paginated; the source for distinct posters
  per week and per-chain splits

One honest caveat, also stated on the page: breakdowns, time series and
heatmaps come back identical for both chain IDs (platform-wide); market stats
differ only in paid workers and active wallets. Per-chain splits are computed
from the `/api/tasks` list, which is chain-specific.

## One-command deploy

```sh
./deploy.sh
```

That refreshes the data, commits, and pushes to `main`; GitHub Pages deploys
automatically (`.github/workflows/deploy.yml`, `actions/deploy-pages` —
`configure-pages` enables Pages on the first run). To deploy by hand instead:

```sh
git push origin main
```

## Local development

```sh
node scripts/fetch-data.mjs   # refresh data/ from the live API
python3 -m http.server 8000    # serve the folder, open http://localhost:8000
```

## Licence

MIT. The Taskmarket mark, lockup and social image are Taskmarket's own, used
here under the brand kit terms for bounty entries; the fonts are under the SIL
Open Font License 1.1.
