#!/usr/bin/env node
/**
 * Renders assets/contribution-heatmap.svg for the profile README from the
 * real contribution snapshot in site/data/contributions.json (written by
 * scripts/fetch-contributions.mjs). No data is invented: if the snapshot is
 * missing, the script exits without touching the existing SVG.
 *
 * Env: INPUT_PATH (default site/data/contributions.json),
 *      OUTPUT_PATH (default assets/contribution-heatmap.svg)
 */

import fs from "node:fs";
import path from "node:path";

const INPUT = process.env.INPUT_PATH || "site/data/contributions.json";
const OUTPUT = process.env.OUTPUT_PATH || "assets/contribution-heatmap.svg";

const W = 1200;
const H = 380;
const CELL = 15;
const GAP = 4;
const STEP = CELL + GAP;
const GRID_X = 118;
const GRID_Y = 182;
const LEVELS = ["#1C0C15", "#451126", "#701A3D", "#A12556", "#E5B5C7"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const fmt = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

if (!fs.existsSync(INPUT)) {
  console.warn(`No snapshot at ${INPUT}; leaving ${OUTPUT} unchanged.`);
  process.exit(0);
}
const data = JSON.parse(fs.readFileSync(INPUT, "utf8"));
const days = data.days;
if (!Array.isArray(days) || days.length === 0) {
  console.warn("Snapshot has no days; leaving SVG unchanged.");
  process.exit(0);
}

/* ---- Stats (computed from the real data only) ---- */
let total = 0, active = 0, run = 0, best = 0, peak = days[0];
for (const d of days) {
  total += d.count;
  if (d.count > 0) {
    active++;
    best = Math.max(best, ++run);
    if (d.count > peak.count) peak = d;
  } else run = 0;
}
const first = toDate(days[0].date);
const last = toDate(days[days.length - 1].date);
const fetched = data.fetchedAt ? fmt(new Date(data.fetchedAt)) : fmt(last);

/* ---- Grid ---- */
const offset = first.getUTCDay();
const weeks = new Map();
days.forEach((d, i) => {
  const week = Math.floor((i + offset) / 7);
  const dow = (i + offset) % 7;
  if (!weeks.has(week)) weeks.set(week, []);
  const x = GRID_X + week * STEP;
  const y = GRID_Y + dow * STEP;
  const glow = d.level === 4 ? ' filter="url(#hm-glow)"' : "";
  weeks.get(week).push(
    `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3.5" fill="${LEVELS[d.level] ?? LEVELS[0]}"${glow}><title>${d.count} contribution${d.count === 1 ? "" : "s"} · ${fmt(toDate(d.date))}</title></rect>`
  );
});
const gridSvg = [...weeks.entries()]
  .map(([w, cells]) => `<g class="hm-w" style="animation-delay:${(0.4 + w * 0.025).toFixed(3)}s">${cells.join("")}</g>`)
  .join("\n    ");

/* ---- Month labels (skip a partial first month that would collide) ---- */
const labels = [];
let lastMonth = -1;
days.forEach((d, i) => {
  const m = toDate(d.date).getUTCMonth();
  if (m === lastMonth) return;
  lastMonth = m;
  labels.push({ col: Math.floor((i + offset) / 7), text: MONTHS[m] });
});
if (labels.length > 1 && labels[1].col - labels[0].col < 3) labels.shift();
const monthSvg = labels
  .map(({ col, text }) => `<text x="${GRID_X + col * STEP}" y="${GRID_Y - 12}">${text}</text>`)
  .join("");

const stats = [
  ["CONTRIBUTIONS", total.toLocaleString("en-US"), `${fmt(first)} – ${fmt(last)}`],
  ["ACTIVE DAYS", String(active), `of ${days.length} days`],
  ["LONGEST STREAK", String(best), "consecutive days"],
  ["BUSIEST DAY", String(peak.count), fmt(toDate(peak.date))],
];
const statsSvg = stats
  .map(([label, value, sub], i) => {
    const x = 610 + i * 150;
    return `<g transform="translate(${x} 58)">
      <text class="hm-mono" font-size="10" letter-spacing="1.8" fill="#C77B9B">${label}</text>
      <text class="hm-serif" y="44" font-size="36" font-weight="300" fill="#F8F0F3">${esc(value)}</text>
      <text class="hm-mono" y="64" font-size="9.5" fill="#B6A3AC">${esc(sub)}</text>
    </g>`;
  })
  .join("\n    ");

const legendX = W - 56 - 5 * 18 - 70;
const legend = LEVELS.map((c, i) => `<rect x="${legendX + 36 + i * 18}" y="342" width="12" height="12" rx="3" fill="${c}"/>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="hm-title hm-desc">
  <title id="hm-title">GitHub contributions for @${esc(data.login)}</title>
  <desc id="hm-desc">${total} contributions from ${fmt(first)} to ${fmt(last)}: ${active} active days, longest streak ${best} days, busiest day ${peak.count} contributions on ${fmt(toDate(peak.date))}. Source: ${esc(data.method || "public GitHub contribution calendar")}, snapshot ${fetched}.</desc>
  <defs>
    <linearGradient id="hm-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#190B12"/><stop offset="1" stop-color="#10070C"/>
    </linearGradient>
    <radialGradient id="hm-light" cx="88%" cy="0%" r="70%">
      <stop offset="0" stop-color="#701A3D" stop-opacity=".55"/><stop offset="1" stop-color="#451126" stop-opacity="0"/>
    </radialGradient>
    <filter id="hm-glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <style>
    .hm-serif { font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif; }
    .hm-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .hm-w { animation: hm-in .9s cubic-bezier(.16,1,.3,1) both; }
    .hm-fade { animation: hm-fade 1.2s ease both; }
    @keyframes hm-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes hm-fade { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .hm-w, .hm-fade { animation: none; } }
  </style>

  <rect width="${W}" height="${H}" rx="20" fill="url(#hm-bg)"/>
  <rect width="${W}" height="${H}" rx="20" fill="url(#hm-light)"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="#C77B9B" stroke-opacity=".16"/>

  <g class="hm-fade">
    <text class="hm-mono" x="56" y="68" font-size="11" letter-spacing="2.6" fill="#C77B9B">COMMIT LOG · REAL GITHUB ACTIVITY</text>
    <text class="hm-serif" x="54" y="110" font-size="27" font-weight="300" fill="#F8F0F3">A year of building, <tspan font-style="italic" fill="#E5B5C7">one square</tspan> at a time.</text>
    ${statsSvg}
  </g>

  <g class="hm-mono" font-size="10.5" fill="#B6A3AC">${monthSvg}</g>
  <g class="hm-mono" font-size="10" fill="#B6A3AC" text-anchor="end">
    <text x="${GRID_X - 12}" y="${GRID_Y + STEP + 11}">Mon</text>
    <text x="${GRID_X - 12}" y="${GRID_Y + 3 * STEP + 11}">Wed</text>
    <text x="${GRID_X - 12}" y="${GRID_Y + 5 * STEP + 11}">Fri</text>
  </g>

  <g>
    ${gridSvg}
  </g>

  <g class="hm-fade">
    <text class="hm-mono" x="56" y="352" font-size="10.5" fill="#B6A3AC">Source: public GitHub contribution calendar for @${esc(data.login)} · snapshot ${fetched} · refreshed daily</text>
    <text class="hm-mono" x="${legendX}" y="352" font-size="10.5" fill="#B6A3AC">Less</text>
    ${legend}
    <text class="hm-mono" x="${legendX + 36 + 5 * 18 + 4}" y="352" font-size="10.5" fill="#B6A3AC">More</text>
  </g>
</svg>
`;

const out = path.resolve(OUTPUT);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg, "utf8");
console.log(`Wrote ${OUTPUT}: ${days.length} days, ${total} contributions (snapshot ${fetched}).`);
