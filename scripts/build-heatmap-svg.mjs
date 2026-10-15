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
const H = 410;
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
let total = 0, active = 0, run = 0, best = 0, bestEnd = -1, peak = days[0];
days.forEach((d, i) => {
  total += d.count;
  if (d.count > 0) {
    active++;
    if (++run > best) { best = run; bestEnd = i; }
    if (d.count > peak.count) peak = d;
  } else run = 0;
});
const bestStart = bestEnd - best + 1;
const first = toDate(days[0].date);
const last = toDate(days[days.length - 1].date);
const fetched = data.fetchedAt ? fmt(new Date(data.fetchedAt)) : fmt(last);

/* ---- Grid ---- */
const offset = first.getUTCDay();
const pos = (i) => {
  const week = Math.floor((i + offset) / 7);
  const dow = (i + offset) % 7;
  return { week, dow, x: GRID_X + week * STEP, y: GRID_Y + dow * STEP };
};
const label = (d) => `${d.count} contribution${d.count === 1 ? "" : "s"} · ${fmt(toDate(d.date))}`;

// Base cells enter as a diagonal wave (week + weekday offset).
const cellsSvg = days
  .map((d, i) => {
    const { week, dow, x, y } = pos(i);
    const delay = (0.3 + (week + dow * 1.6) * 0.018).toFixed(3);
    const glow = d.level === 4 ? ' filter="url(#hm-glow)"' : "";
    return `<rect class="hm-c" style="animation-delay:${delay}s" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3.5" fill="${LEVELS[d.level] ?? LEVELS[0]}"${glow}><title>${label(d)}</title></rect>`;
  })
  .join("\n    ");

// Bright copies of active days, revealed only where the scan beam passes.
const litSvg = days
  .map((d, i) => {
    if (d.count === 0) return "";
    const { x, y } = pos(i);
    const o = (0.35 + d.level * 0.16).toFixed(2);
    return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3.5" fill="#F8F0F3" fill-opacity="${o}"/>`;
  })
  .join("");

// The busiest days pulse with an expanding ring.
const top = days
  .map((d, i) => ({ d, i }))
  .filter(({ d }) => d.count > 0)
  .sort((a, b) => b.d.count - a.d.count)
  .slice(0, 6);
const pulsesSvg = top
  .map(({ i }, k) => {
    const { x, y } = pos(i);
    const cx = x + CELL / 2, cy = y + CELL / 2, begin = (2.4 + k * 0.7).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="#E5B5C7" stroke-width="1.2" opacity="0">
      <animate attributeName="r" values="8;20" dur="3.2s" begin="${begin}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;.9;0" keyTimes="0;.15;1" dur="3.2s" begin="${begin}s" repeatCount="indefinite"/>
    </circle>`;
  })
  .join("\n    ");

// The longest streak lights up day by day, holds, then fades and repeats.
let streakSvg = "";
if (best > 1) {
  const cells = [];
  for (let i = bestStart, k = 0; i <= bestEnd; i++, k++) {
    const { x, y } = pos(i);
    const begin = (2 + k * 0.09).toFixed(2);
    cells.push(`<rect x="${x - 1}" y="${y - 1}" width="${CELL + 2}" height="${CELL + 2}" rx="4.5" fill="#F8F0F3" fill-opacity=".18" stroke="#F8F0F3" stroke-width="1.4" opacity="0" filter="url(#hm-glow)">
      <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.04;.6;.72;1" dur="9s" begin="${begin}s" repeatCount="indefinite"/>
    </rect>`);
  }
  const startPos = pos(bestStart);
  const labelX = Math.min(startPos.x, W - 360);
  streakSvg = `${cells.join("\n    ")}
    <g class="hm-fade" style="animation-delay:2.6s">
      <path d="M${startPos.x + CELL / 2} ${GRID_Y + 7 * STEP - 2} V ${GRID_Y + 7 * STEP + 10}" stroke="#E5B5C7" stroke-opacity=".6"/>
      <text class="hm-mono" x="${labelX}" y="${GRID_Y + 7 * STEP + 24}" font-size="10.5" letter-spacing="1.6" fill="#E5B5C7">LONGEST STREAK · ${best} DAYS · ${fmt(toDate(days[bestStart].date)).toUpperCase()} – ${fmt(toDate(days[bestEnd].date)).toUpperCase()}</text>
    </g>`;
}

const gridW = (Math.floor((days.length - 1 + offset) / 7) + 1) * STEP;
const gridH = 7 * STEP;

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
  ["CONTRIBUTIONS", total.toLocaleString("en-US"), `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()} – ${MONTHS[last.getUTCMonth()]} ${last.getUTCFullYear()}`],
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
const legend = LEVELS.map((c, i) => `<rect x="${legendX + 36 + i * 18}" y="372" width="12" height="12" rx="3" fill="${c}"/>`).join("");

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
    <linearGradient id="hm-beam-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="hm-beam-line" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E5B5C7" stop-opacity="0"/><stop offset=".5" stop-color="#E5B5C7" stop-opacity=".9"/><stop offset="1" stop-color="#E5B5C7" stop-opacity="0"/>
    </linearGradient>
    <mask id="hm-beam-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <rect x="${GRID_X - 160}" y="${GRID_Y - 6}" width="140" height="${gridH + 12}" fill="url(#hm-beam-grad)">
        <animate attributeName="x" values="${GRID_X - 160};${GRID_X + gridW + 20}" dur="7s" begin="3.2s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1"/>
      </rect>
    </mask>
    <filter id="hm-glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <style>
    .hm-serif { font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif; }
    .hm-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .hm-c { transform-box: fill-box; transform-origin: center; animation: hm-in .8s cubic-bezier(.34,1.56,.64,1) both; }
    .hm-fade { animation: hm-fade 1.2s ease both; }
    @keyframes hm-in { from { opacity: 0; transform: scale(.2); } to { opacity: 1; transform: none; } }
    @keyframes hm-fade { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .hm-c, .hm-fade { animation: none; } .hm-motion { display: none; } }
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
    ${cellsSvg}
  </g>

  <g class="hm-motion">
    <g mask="url(#hm-beam-mask)">${litSvg}</g>
    <rect x="${GRID_X - 90}" y="${GRID_Y - 8}" width="1.5" height="${gridH + 14}" fill="url(#hm-beam-line)" opacity="0">
      <animate attributeName="x" values="${GRID_X - 90};${GRID_X + gridW + 90}" dur="7s" begin="3.2s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1"/>
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.9;1" dur="7s" begin="3.2s" repeatCount="indefinite"/>
    </rect>
    ${pulsesSvg}
    ${streakSvg}
  </g>

  <g class="hm-fade">
    <text class="hm-mono" x="56" y="382" font-size="10.5" fill="#B6A3AC">Source: public GitHub contribution calendar for @${esc(data.login)} · snapshot ${fetched} · refreshed daily</text>
    <text class="hm-mono" x="${legendX}" y="382" font-size="10.5" fill="#B6A3AC">Less</text>
    ${legend}
    <text class="hm-mono" x="${legendX + 36 + 5 * 18 + 4}" y="382" font-size="10.5" fill="#B6A3AC">More</text>
  </g>
</svg>
`;

const out = path.resolve(OUTPUT);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg, "utf8");
console.log(`Wrote ${OUTPUT}: ${days.length} days, ${total} contributions (snapshot ${fetched}).`);
