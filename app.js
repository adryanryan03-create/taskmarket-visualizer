// Taskmarket live visualizer — client side.
// Reads only the JSON files committed by scripts/fetch-data.mjs (data/*.json).
// No API calls, no wallet, no tracking, no cookies.
"use strict";

const $ = (s) => document.querySelector(s);
const state = { chain: "all", flowRange: "7d", trendRange: "7d", metric: "activeAgents", heat: "hourOfWeek" };
let D = {}; // { meta, tempo, base, posters, tasksTempo, tasksBase }

const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
const money = (baseUnits) => {
  const v = Number(baseUnits || 0) / 1e6;
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "k";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
};
const shortAddr = (a) => (a && a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a || "—");
const DAY = 86400000;

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < DAY / 1000) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / (DAY / 1000)) + "d ago";
}
function asOfStr(iso) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}
async function loadJson(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(path + " → " + r.status);
  return r.json();
}
function chainData() {
  // series/breakdowns/heatmap are platform-wide (identical for both chains);
  // tempo.json is used as the platform source, base.json for chain-specific stats.
  return state.chain === "base" ? D.base : D.tempo;
}
function tasksForChain() {
  if (state.chain === "tempo") return D.tasksTempo ? D.tasksTempo.tasks : [];
  if (state.chain === "base") return D.tasksBase ? D.tasksBase.tasks : [];
  return [...(D.tasksTempo ? D.tasksTempo.tasks : []), ...(D.tasksBase ? D.tasksBase.tasks : [])];
}

/* ---------- headline ---------- */
function renderHeadline() {
  const t = D.tempo.stats, b = D.base.stats;
  $("#h-workers").textContent = fmtInt(t.registeredWorkers);
  $("#h-workers-sub").textContent = "agents + people, all time";
  $("#h-active").textContent = fmtInt(t.activeAgents7d);
  $("#h-active-sub").textContent = fmtInt(t.activeWorkers7d) + " active wallets · last 7 days";
  $("#h-open").textContent = fmtInt(t.openTasks);
  $("#h-open-sub").textContent = "awaiting work right now";
  if (state.chain === "tempo") {
    $("#h-paid").textContent = fmtInt(t.paidWorkers);
    $("#h-paid-sub").textContent = "paid on Tempo · " + fmtInt(t.activeWallets) + " active wallets";
  } else if (state.chain === "base") {
    $("#h-paid").textContent = fmtInt(b.paidWorkers);
    $("#h-paid-sub").textContent = "paid on Base · " + fmtInt(b.activeWallets) + " active wallets";
  } else {
    $("#h-paid").textContent = fmtInt(t.paidWorkers + b.paidWorkers);
    $("#h-paid-sub").textContent = "Tempo " + fmtInt(t.paidWorkers) + " · Base " + fmtInt(b.paidWorkers);
  }
}

/* ---------- money flow ---------- */
function rangeDays(r) { return r === "7d" ? 7 : r === "30d" ? 30 : 90; }
function renderFlow() {
  const days = rangeDays(state.flowRange);
  const series = D.tempo.series[state.flowRange]; // platform-wide
  const putUp = series.reduce((a, b) => a + Number(b.rewardVolume || 0), 0);
  const paid = series.reduce((a, b) => a + Number(b.paidVolume || 0), 0);
  const posted = series.reduce((a, b) => a + (b.tasksCreated || 0), 0);
  const settled = series.reduce((a, b) => a + (b.settlements || 0), 0);
  const cutoff = Date.now() - days * DAY;
  const tasks = tasksForChain().filter((t) => new Date(t.createdAt).getTime() >= cutoff);
  const posters = new Set(tasks.map((t) => t.requester)).size;
  const chainLabel = state.chain === "all" ? "both chains" : state.chain === "tempo" ? "Tempo" : "Base";

  // Flow widths: square-root scale so small streams stay visible.
  const w = (v, max) => 8 + 92 * Math.sqrt(v / max);
  const maxV = Math.max(putUp, paid, 1);
  const putW = w(putUp, maxV), paidW = w(paid, maxV);
  const svg = `
  <svg viewBox="0 0 720 240" role="img" aria-label="Money flow: ${fmtInt(posters)} posters put up ${money(putUp)} across ${fmtInt(posted)} tasks; ${money(paid)} was paid out in ${fmtInt(settled)} settlements.">
    <defs>
      <linearGradient id="gPut" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#D9A097"/><stop offset="1" stop-color="#E74079"/>
      </linearGradient>
      <linearGradient id="gPaid" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#E74079"/><stop offset="1" stop-color="#FFF6E8"/>
      </linearGradient>
    </defs>
    <text x="20" y="28" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="11">POSTERS · ${chainLabel}</text>
    <text x="20" y="62" fill="#FFF6E8" font-family="Instrument Serif, serif" font-size="34">${fmtInt(posters)}</text>
    <text x="20" y="86" fill="#B0A79D" font-size="13" font-family="Inter Tight, sans-serif">${fmtInt(posted)} tasks posted</text>
    <text x="300" y="28" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="11">PUT UP · IN ESCROW</text>
    <text x="300" y="62" fill="#FFF6E8" font-family="Instrument Serif, serif" font-size="34">${money(putUp)}</text>
    <text x="300" y="86" fill="#B0A79D" font-size="13" font-family="Inter Tight, sans-serif">held until a winner is picked</text>
    <text x="540" y="28" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="11">PAID TO WINNERS</text>
    <text x="540" y="62" fill="#FFF6E8" font-family="Instrument Serif, serif" font-size="34">${money(paid)}</text>
    <text x="540" y="86" fill="#B0A79D" font-size="13" font-family="Inter Tight, sans-serif">${fmtInt(settled)} settlements</text>
    <path d="M 150 130 L 300 ${150 - putW / 2} L 300 ${150 + putW / 2} L 150 ${150 + 14} Z" fill="url(#gPut)" opacity="0.85"/>
    <path d="M 430 130 L 540 ${150 - paidW / 2} L 540 ${150 + paidW / 2} L 430 ${150 + 10} Z" fill="url(#gPaid)" opacity="0.85"/>
    <circle cx="150" cy="130" r="7" fill="#D9A097"/>
    <circle cx="300" cy="150" r="7" fill="#E74079"/>
    <circle cx="430" cy="150" r="7" fill="#E74079"/>
    <circle cx="540" cy="150" r="7" fill="#FFF6E8"/>
    <text x="20" y="200" fill="#B0A79D" font-size="13" font-family="Inter Tight, sans-serif">Last ${days} days · ${chainLabel} · stream width ∝ amount (square-root scale)</text>
    <text x="20" y="222" fill="#B0A79D" font-size="13" font-family="Inter Tight, sans-serif">${paid > 0 ? Math.round((paid / putUp) * 100) + "% of what was put up in this window was paid out" : ""} — payouts lag postings, so the two rarely match in one window.</text>
  </svg>`;
  $("#flow-viz").innerHTML = svg;
  $("#flow-note").textContent =
    "Posters and tasks are counted from the /api/tasks list; put up and paid are summed from /api/stats/platform-time-series. " +
    "The series is platform-wide — the API returns the same totals for both chains.";
}

/* ---------- trends chart ---------- */
function drawLine(canvas, labels, values, isMoney) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = 260;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const padL = 58, padR = 10, padT = 12, padB = 26;
  const max = Math.max(...values, 1), min = 0;
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(values.length - 1, 1);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  ctx.strokeStyle = "rgba(239,233,226,.12)"; ctx.fillStyle = "#B0A79D";
  ctx.font = "11px 'Departure Mono', monospace"; ctx.textAlign = "right";
  for (let g = 0; g <= 3; g++) {
    const v = (max * g) / 3, yy = y(v);
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    ctx.fillText(isMoney ? money(v * 1e6) : fmtInt(v), padL - 8, yy + 4);
  }
  ctx.textAlign = "center";
  const step = Math.ceil(labels.length / 6);
  labels.forEach((lb, i) => { if (i % step === 0) ctx.fillText(lb.slice(5), x(i), H - 8); });
  const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
  grad.addColorStop(0, "rgba(231,64,121,.35)"); grad.addColorStop(1, "rgba(231,64,121,0)");
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
  ctx.lineTo(x(values.length - 1), H - padB); ctx.lineTo(x(0), H - padB); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
  ctx.strokeStyle = "#E74079"; ctx.lineWidth = 2; ctx.stroke();
  const li = values.length - 1;
  ctx.beginPath(); ctx.arc(x(li), y(values[li]), 4, 0, 7); ctx.fillStyle = "#FFF6E8"; ctx.fill();
}
function renderTrends() {
  const series = D.tempo.series[state.trendRange];
  const labels = series.map((b) => b.bucket);
  const vals = series.map((b) => state.metric === "rewardVolume" || state.metric === "paidVolume"
    ? Number(b[state.metric] || 0) / 1e6 : (b[state.metric] || 0));
  drawLine($("#trend-chart"), labels, vals, state.metric === "rewardVolume" || state.metric === "paidVolume");
  const total = vals.reduce((a, b) => a + b, 0);
  const names = { activeAgents: "active agents", tasksCreated: "tasks posted", rewardVolume: "rewards put up", paidVolume: "rewards paid" };
  const isMoney = state.metric === "rewardVolume" || state.metric === "paidVolume";
  $("#trend-note").textContent =
    state.metric === "activeAgents"
      ? `Average ${fmtInt(Math.round(total / vals.length))} active agents per day over the last ${rangeDays(state.trendRange)} days (the same agent active on several days is counted once per day). Daily figures from /api/stats/platform-time-series (platform-wide).`
      : `Total ${names[state.metric]} over the last ${rangeDays(state.trendRange)} days: ` +
        (isMoney ? money(total * 1e6) : fmtInt(total)) +
        ". Daily figures from /api/stats/platform-time-series (platform-wide).";
}

/* ---------- breakdown bars ---------- */
function renderBars(el, rows, key, labelKey, alt) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  el.innerHTML = rows.map((r) => `
    <div class="bar-row">
      <span class="bname">${String(r[labelKey]).replace(/_/g, " ")}</span>
      <span class="bar-track"><span class="bar-fill${alt ? " alt" : ""}" style="display:block;width:${Math.max(2, (r.count / max) * 100)}%"></span></span>
      <span class="bval">${fmtInt(r.count)}</span>
    </div>`).join("");
}
function renderBreakdown() {
  const bd = D.tempo.breakdowns;
  renderBars($("#mode-bars"), [...bd.mode].sort((a, b) => b.count - a.count), "count", "mode", false);
  const order = ["open", "claimed", "worker_selected", "pending_approval", "completed", "cancelled", "expired"];
  const byStatus = [...bd.status].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  renderBars($("#status-bars"), byStatus, "count", "status", true);
  const get = (s) => (bd.status.find((x) => x.status === s) || {}).count || 0;
  const decided = get("completed") + get("cancelled") + get("expired");
  $("#status-note").textContent =
    `${fmtInt(get("completed"))} of ${fmtInt(decided)} decided tasks completed (${decided ? Math.round((get("completed") / decided) * 100) : 0}%). ` +
    `${fmtInt(get("cancelled") + get("expired"))} tasks died — cancelled or expired without a winner.`;
}

/* ---------- insights ---------- */
function renderInsights() {
  const bd = D.tempo.breakdowns;
  const get = (s) => (bd.status.find((x) => x.status === s) || {}).count || 0;
  const decided = get("completed") + get("cancelled") + get("expired");
  const s30 = D.tempo.series["30d"];
  const last7 = s30.slice(-7), prev7 = s30.slice(-14, -7);
  const t7 = last7.reduce((a, b) => a + b.tasksCreated, 0);
  const tp7 = prev7.reduce((a, b) => a + b.tasksCreated, 0);
  const growth = tp7 ? Math.round(((t7 - tp7) / tp7) * 100) : 0;
  const put30 = s30.reduce((a, b) => a + Number(b.rewardVolume), 0);
  const paid30 = s30.reduce((a, b) => a + Number(b.paidVolume), 0);
  const weeks = D.posters.weeks;
  const lastFull = [...weeks].reverse().find((w) => w.tasks > 0 && w.week < new Date().toISOString().slice(0, 10));
  // busiest hour from the hour-of-week heatmap
  const hm = D.tempo.heatmap.hourOfWeek;
  const byHour = Array(24).fill(0);
  for (const c of hm.cells || []) byHour[+c.col] += c.count;
  const busyHour = byHour.indexOf(Math.max(...byHour));
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const byDay = Array(7).fill(0);
  for (const c of hm.cells || []) byDay[+c.row] += c.count;
  const busyDay = days[byDay.indexOf(Math.max(...byDay))];
  const items = [
    [`${decided ? Math.round((get("completed") / decided) * 100) : 0}% of decided tasks finish with a winner.`, `${fmtInt(get("completed"))} completed, ${fmtInt(get("cancelled"))} cancelled, ${fmtInt(get("expired"))} expired — out of ${fmtInt(decided)} tasks that reached a decision.`],
    [`Posting is concentrated: one poster took ${Math.round((lastFull?.topPosterShare || 0) * 100)}% of tasks in the week of ${lastFull?.week || "—"}.`, `That week had ${fmtInt(lastFull?.distinctPosters || 0)} distinct posters for ${fmtInt(lastFull?.tasks || 0)} tasks. A single heavy poster can move the whole market.`],
    [`Tasks posted ${growth >= 0 ? "grew" : "fell"} ${Math.abs(growth)}% week over week.`, `${fmtInt(t7)} tasks in the last 7 days vs ${fmtInt(tp7)} in the 7 days before.`],
    [`${busyDay}s around ${String(busyHour).padStart(2, "0")}:00 UTC are the busiest hour.`, `Activity peaks in that hour across the last 7 days; the quietest hours are the small hours of the UTC morning.`],
    [`${Math.round((paid30 / Math.max(put30, 1)) * 100)}% of rewards put up in the last 30 days were paid out.`, `${money(put30)} put up, ${money(paid30)} paid. The gap is escrow still waiting on decisions, plus payouts landing after the window.`],
  ];
  $("#insight-list").innerHTML = items.map(([b, s]) => `<li><b>${b}</b><span>${s}</span></li>`).join("");
}

/* ---------- heatmap ---------- */
function renderHeatmap() {
  const grid = $("#heat-grid");
  if (state.heat === "hourOfWeek") {
    const hm = D.tempo.heatmap.hourOfWeek;
    const cell = new Map((hm.cells || []).map((c) => [`${c.row}:${c.col}`, c.count]));
    const max = Math.max(...(hm.cells || []).map((c) => c.count), 1);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let html = `<div></div>` + Array.from({ length: 24 }, (_, h) => `<div class="hhead">${String(h).padStart(2, "0")}</div>`).join("");
    for (let r = 0; r < 7; r++) {
      html += `<div class="hlabel">${days[r]}</div>`;
      for (let c = 0; c < 24; c++) {
        const v = cell.get(`${r}:${c}`) || 0;
        const a = v / max;
        const bg = v === 0 ? "rgba(239,233,226,.05)" : `rgba(231,64,121,${0.15 + 0.85 * a})`;
        html += `<div class="hcell" style="background:${bg}" title="${days[r]} ${String(c).padStart(2, "0")}:00 UTC — ${v} events">${v || ""}</div>`;
      }
    }
    grid.style.gridTemplateColumns = "34px repeat(24, 1fr)";
    grid.innerHTML = html;
    $("#heat-note").textContent = "Rows are days of the week, columns are hours (UTC), last 7 days. Source: /api/stats/activity-heatmap?dimension=hourOfWeek.";
  } else {
    const hm = D.tempo.heatmap.mode;
    const cell = new Map((hm.cells || []).map((c) => [`${c.row}:${c.col}`, c]));
    const max = Math.max(...(hm.cells || []).map((c) => c.count), 1);
    let html = `<div></div>` + hm.colKeys.map((d) => `<div class="hhead">${d.slice(5)}</div>`).join("");
    for (const row of hm.rowKeys) {
      html += `<div class="hlabel" style="text-transform:capitalize">${row}</div>`;
      for (const col of hm.colKeys) {
        const c = cell.get(`${row}:${col}`);
        const v = c ? c.count : 0;
        const bg = v === 0 ? "rgba(239,233,226,.05)" : `rgba(231,64,121,${0.15 + 0.85 * (v / max)})`;
        html += `<div class="hcell" style="background:${bg}" title="${row} · ${col} — ${v} tasks, ${money(c ? c.volume : 0)} put up">${v || ""}</div>`;
      }
    }
    grid.style.gridTemplateColumns = `86px repeat(${hm.colKeys.length}, 1fr)`;
    grid.innerHTML = html;
    $("#heat-note").textContent = "Tasks per mode per day, last 7 days. Cell colour is the count; hover for the reward volume. Source: /api/stats/activity-heatmap?dimension=mode.";
  }
}

/* ---------- feed ---------- */
function renderFeed() {
  const items = [];
  const push = (feed, chainKey) => {
    for (const it of feed.items || []) {
      if (state.chain !== "all" && chainKey !== state.chain) continue;
      items.push({ ...it, chainKey });
    }
  };
  push(D.tempo.feed, "tempo");
  push(D.base.feed, "base");
  // The feed is platform-wide: the same event appears in both chains' files.
  const seen = new Set();
  const items2 = items.filter((it) => {
    const k = `${it.type}|${it.timestamp}|${it.taskId}|${it.actor}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  items2.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const label = (t) => ({
    task_submitted: "Submission", task_created: "Task posted", task_completed: "Completed",
    task_claimed: "Claimed", reward_released: "Reward paid", settlement: "Settled",
    task_cancelled: "Cancelled", review: "Reviewed",
  }[t] || t.replace(/_/g, " "));
  $("#feed-list").innerHTML = items2.slice(0, 25).map((it) => `
    <li>
      <span class="ftype">${label(it.type)}</span>
      <span class="fbody">
        <span>${it.taskTitle ? it.taskTitle : "—"}</span>
        <span class="ftitle">${shortAddr(it.actor)}${it.actorAgentId ? " · agent #" + it.actorAgentId : ""}${it.amount ? " · " + money(it.amount) : ""}${it.rating ? " · ★" + it.rating : ""} · ${it.chainKey}</span>
      </span>
      <span class="ftime">${timeAgo(it.timestamp)}</span>
    </li>`).join("") || `<li>No recent activity for this chain.</li>`;
}

/* ---------- posters ---------- */
function drawPosterChart() {
  const canvas = $("#poster-chart");
  const weeks = D.posters.weeks;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = 220;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const padL = 34, padR = 8, padT = 10, padB = 26;
  const max = Math.max(...weeks.map((w) => w.distinctPosters), 1);
  const bw = (W - padL - padR) / weeks.length;
  ctx.font = "11px 'Departure Mono', monospace"; ctx.fillStyle = "#B0A79D"; ctx.textAlign = "right";
  for (let g = 0; g <= 3; g++) {
    const v = (max * g) / 3, yy = padT + (1 - g / 3) * (H - padT - padB);
    ctx.strokeStyle = "rgba(239,233,226,.12)";
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    ctx.fillText(fmtInt(Math.round(v)), padL - 6, yy + 4);
  }
  weeks.forEach((w, i) => {
    const x0 = padL + i * bw + 4, wdt = bw - 8;
    const tH = (w.tempoPosters / max) * (H - padT - padB);
    const bH = (w.basePosters / max) * (H - padT - padB);
    const yBase = H - padB;
    ctx.fillStyle = "#D9A097";
    ctx.fillRect(x0, yBase - tH, wdt, tH);
    ctx.fillStyle = "#E74079";
    ctx.fillRect(x0, yBase - tH - bH, wdt, bH);
    ctx.fillStyle = "#B0A79D"; ctx.textAlign = "center";
    if (i % 2 === 0) ctx.fillText(w.week.slice(5), x0 + wdt / 2, H - 8);
    if (w.distinctPosters > 0) {
      ctx.fillStyle = "#FFF6E8"; ctx.textAlign = "center";
      ctx.fillText(String(w.distinctPosters), x0 + wdt / 2, yBase - tH - bH - 4);
    }
  });
}
function renderPosters() {
  drawPosterChart();
  const weeks = [...D.posters.weeks].slice(-6).reverse();
  $("#poster-table").innerHTML = weeks.map((w) => `
    <div class="pw"><b>${w.distinctPosters}</b><span>week of ${w.week}<br>Tempo ${w.tempoPosters} · Base ${w.basePosters} · ${w.tasks} tasks<br>top poster: ${Math.round(w.topPosterShare * 100)}% of tasks</span></div>`).join("");
  const total = D.posters.totalTasksSeen;
  $("#poster-note").textContent =
    `Counted from ${fmtInt(total)} tasks returned by /api/tasks at the last fetch. ` +
    `A poster is one requester address; the same address posting on both chains counts once.`;
  $("#methods-task-count").textContent = fmtInt(total);
}

/* ---------- fresh tasks ---------- */
function renderFresh() {
  const tasks = tasksForChain().filter((t) => t.status === "open")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 12);
  $("#fresh-list").innerHTML = tasks.map((t) => `
    <li>
      <span class="frew">${t.netReward ? money(t.netReward) : "—"}</span>
      <span class="fchain">${t.chainId === 4217 ? "Tempo" : "Base"}</span>
      <span class="ftitle">${t.title || t.ref} <span class="dim mono">· ${t.ref} · ${timeAgo(t.createdAt)}</span></span>
    </li>`).join("") || `<li>No open tasks in this view right now.</li>`;
}

/* ---------- methods ---------- */
function renderMethods() {
  const eps = (D.meta && D.meta.endpoints) || [];
  $("#methods-list").innerHTML = eps.map((e) => `<li><span class="mono">${e}</span></li>`).join("") +
    `<li>Tempo (chainId 4217, OUSD) and Base (chainId 8453, USDC) — fetched for both.</li>` +
    `<li>Refreshed hourly by a GitHub Actions workflow (<span class="mono">.github/workflows/update-data.yml</span>) that fetches server-side and commits <span class="mono">data/*.json</span>.</li>`;
}

/* ---------- wire up ---------- */
function renderAll() {
  renderHeadline(); renderFlow(); renderTrends(); renderBreakdown();
  renderInsights(); renderHeatmap(); renderFeed(); renderPosters(); renderFresh(); renderMethods();
  const asof = D.meta ? D.meta.fetchedAt : D.tempo.fetchedAt;
  $("#asof").textContent = asOfStr(asof);
  $("#asof-rel").textContent = "· updated " + timeAgo(asof);
}
function bindSwitches() {
  document.querySelectorAll(".chain-switch button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".chain-switch button").forEach((x) => x.classList.toggle("on", x === b));
    state.chain = b.dataset.chain;
    renderHeadline(); renderFlow(); renderFeed(); renderFresh();
  }));
  document.querySelectorAll("[data-range-group]").forEach((g) => g.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    if (g.dataset.rangeGroup === "flow") { state.flowRange = b.dataset.range; renderFlow(); }
    if (g.dataset.rangeGroup === "trends") { state.trendRange = b.dataset.range; renderTrends(); }
    if (g.dataset.rangeGroup === "heatmap") { state.heat = b.dataset.heat; renderHeatmap(); }
  })));
  document.querySelectorAll(".metric-switch button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".metric-switch button").forEach((x) => x.classList.toggle("on", x === b));
    state.metric = b.dataset.metric; renderTrends();
  }));
  document.querySelectorAll(".copy-link").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const url = location.origin + location.pathname + a.dataset.copy;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { a.textContent = "Link copied ✓"; setTimeout(() => { a.textContent = "Copy link to this view"; }, 2000); });
  }));
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { renderTrends(); drawPosterChart(); }, 200); });
}

(async () => {
  try {
    const [meta, tempo, base, posters] = await Promise.all([
      loadJson("data/meta.json"), loadJson("data/tempo.json"),
      loadJson("data/base.json"), loadJson("data/posters.json"),
    ]);
    D = { meta, tempo, base, posters };
    bindSwitches();
    renderAll();
    // Task lists are large; load them after first paint for the flow + fresh sections.
    const [tt, tb] = await Promise.all([
      loadJson("data/tasks-tempo.json").catch(() => null),
      loadJson("data/tasks-base.json").catch(() => null),
    ]);
    D.tasksTempo = tt; D.tasksBase = tb;
    renderFlow(); renderFresh(); renderPosters();
  } catch (e) {
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      `<p style="background:#3A1420;border:1px solid #E74079;border-radius:12px;padding:16px">Data could not be loaded (${String(e.message || e)}). The hourly fetch may be running — try again in a few minutes.</p>`);
  }
})();
