// fetch-data.mjs — server-side Taskmarket data collector.
// Runs in GitHub Actions on an hourly schedule (and locally with `node scripts/fetch-data.mjs`).
// Every number on the dashboard comes from these public, keyless endpoints:
//   https://api.taskmarket.dev/api/market/stats
//   https://api.taskmarket.dev/api/stats/breakdowns
//   https://api.taskmarket.dev/api/stats/platform-time-series
//   https://api.taskmarket.dev/api/stats/activity-heatmap
//   https://api.taskmarket.dev/api/stats/activity-feed
//   https://api.taskmarket.dev/api/tasks
// The browser never talks to the API (it blocks cross-origin requests);
// the static site only reads the JSON files this script commits to data/.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://api.taskmarket.dev";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const CHAINS = [
  { id: 4217, key: "tempo", name: "Tempo", symbol: "OUSD" },
  { id: 8453, key: "base", name: "Base", symbol: "USDC" },
];

async function getJson(path, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(BASE + path, { signal: ctrl.signal, headers: { accept: "application/json" } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

// ISO week key: the Monday (YYYY-MM-DD) of the week containing `d`.
function weekMonday(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7; // Mon=1..Sun=7
  x.setUTCDate(x.getUTCDate() - (day - 1));
  return x.toISOString().slice(0, 10);
}

function titleOf(description) {
  const first = String(description || "").split("\n")[0].trim();
  return first.length > 140 ? first.slice(0, 137) + "…" : first;
}

async function fetchChain(chain) {
  const q = `chainId=${chain.id}`;
  const [stats, breakdowns, series7d, series30d, series90d, heatmapWeek, heatmapMode, feed] =
    await Promise.all([
      getJson(`/api/market/stats?${q}`),
      getJson(`/api/stats/breakdowns?${q}`),
      getJson(`/api/stats/platform-time-series?${q}&range=7d&bucket=day`),
      getJson(`/api/stats/platform-time-series?${q}&range=30d&bucket=day`),
      getJson(`/api/stats/platform-time-series?${q}&range=90d&bucket=day`),
      getJson(`/api/stats/activity-heatmap?${q}&range=7d&dimension=hourOfWeek`),
      getJson(`/api/stats/activity-heatmap?${q}&range=7d&dimension=mode`),
      getJson(`/api/stats/activity-feed?${q}&limit=50`),
    ]);

  // Paginate the full task list (newest first) — the source for
  // distinct-posters-per-week and per-chain task counts.
  const tasks = [];
  let cursor = null;
  let pages = 0;
  do {
    const path = `/api/tasks?${q}&sort=newest&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await getJson(path);
    for (const t of page.tasks || []) {
      tasks.push({
        id: t.id,
        ref: t.referenceCode,
        chainId: t.chainId,
        requester: t.requester,
        status: t.status,
        mode: t.mode,
        reward: t.reward ?? null,
        netReward: t.netReward ?? null,
        createdAt: t.createdAt,
        title: titleOf(t.description),
      });
    }
    cursor = page.hasMore ? page.nextCursor : null;
    pages++;
  } while (cursor && pages < 80);

  return {
    chain: chain.key,
    chainId: chain.id,
    symbol: chain.symbol,
    fetchedAt: new Date().toISOString(),
    stats,
    breakdowns,
    series: { "7d": series7d, "30d": series30d, "90d": series90d },
    heatmap: { hourOfWeek: heatmapWeek, mode: heatmapMode },
    feed,
    taskCount: tasks.length,
    _tasks: tasks, // stripped out by the caller into data/tasks-<chain>.json
  };
}

function postersPerWeek(allTasks) {
  // Last 12 ISO weeks, per chain and combined.
  const weeks = new Map(); // monday -> { tempo: Set, base: Set, tempoTasks, baseTasks, top: Map }
  const now = new Date();
  const mondays = [];
  for (let i = 0; i < 12; i++) {
    const m = new Date(now);
    m.setUTCDate(m.getUTCDate() - 7 * i);
    mondays.push(weekMonday(m));
  }
  for (const t of allTasks) {
    const w = weekMonday(new Date(t.createdAt));
    if (!mondays.includes(w)) continue;
    if (!weeks.has(w)) {
      weeks.set(w, {
        week: w,
        tempo: new Set(),
        base: new Set(),
        tempoTasks: 0,
        baseTasks: 0,
        counts: new Map(), // requester -> tasks this week (all chains)
      });
    }
    const e = weeks.get(w);
    const key = t.chainId === 4217 ? "tempo" : "base";
    e[key].add(t.requester);
    e[key + "Tasks"]++;
    e.counts.set(t.requester, (e.counts.get(t.requester) || 0) + 1);
  }
  return mondays
    .sort()
    .map((w) => {
      const e = weeks.get(w);
      if (!e) return { week: w, tempoPosters: 0, basePosters: 0, distinctPosters: 0, tempoTasks: 0, baseTasks: 0, tasks: 0, topPosterTasks: 0, topPosterShare: 0 };
      const distinct = new Set([...e.tempo, ...e.base]).size;
      const top = [...e.counts.values()].sort((a, b) => b - a)[0] || 0;
      const total = e.tempoTasks + e.baseTasks;
      return {
        week: w,
        tempoPosters: e.tempo.size,
        basePosters: e.base.size,
        distinctPosters: distinct,
        tempoTasks: e.tempoTasks,
        baseTasks: e.baseTasks,
        tasks: total,
        topPosterTasks: top,
        topPosterShare: total ? +(top / total).toFixed(3) : 0,
      };
    });
}

const fetchedAt = new Date().toISOString();
const perChain = [];
for (const chain of CHAINS) {
  console.log(`fetching ${chain.key}…`);
  perChain.push(await fetchChain(chain));
}
const allTasks = perChain.flatMap((c) => c._tasks);
const posters = postersPerWeek(allTasks);

await mkdir(OUT, { recursive: true });
for (const c of perChain) {
  const { _tasks, ...main } = c;
  await writeFile(join(OUT, `${c.chain}.json`), JSON.stringify(main, null, 2) + "\n");
  await writeFile(
    join(OUT, `tasks-${c.chain}.json`),
    JSON.stringify({ fetchedAt, chain: c.chain, chainId: c.chainId, count: _tasks.length, tasks: _tasks }, null, 2) + "\n"
  );
}
await writeFile(
  join(OUT, "posters.json"),
  JSON.stringify({ fetchedAt, weeks: posters, totalTasksSeen: allTasks.length }, null, 2) + "\n"
);
await writeFile(
  join(OUT, "meta.json"),
  JSON.stringify(
    {
      fetchedAt,
      source: "https://api.taskmarket.dev",
      chains: CHAINS,
      endpoints: [
        "/api/market/stats",
        "/api/stats/breakdowns",
        "/api/stats/platform-time-series",
        "/api/stats/activity-heatmap",
        "/api/stats/activity-feed",
        "/api/tasks",
      ],
      note: "Breakdowns, time series and heatmaps come back identical for both chainIds (platform-wide). market/stats differs only in paidWorkers and activeWallets. Per-chain splits on this dashboard are computed from the /api/tasks list, which is chain-specific.",
    },
    null,
    2
  ) + "\n"
);
console.log(`done: ${allTasks.length} tasks, ${posters.length} weeks, fetchedAt ${fetchedAt}`);
