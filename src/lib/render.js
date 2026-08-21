import { escapeHtml, formatINR } from "./format.js";
import { ROLE_LABELS } from "./constants.js";

// ---------------------------------------------------------------------------
// Icons — small hand-drawn line icons, no external icon library needed.
// ---------------------------------------------------------------------------
const ICON_PATHS = {
  dashboard: `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`,
  heart: `<path d="M12 20.5s-7.5-4.6-10-9.4C.5 7.6 2.4 4 6 4c2.1 0 3.6 1.2 6 3.6C14.4 5.2 15.9 4 18 4c3.6 0 5.5 3.6 4 7.1-2.5 4.8-10 9.4-10 9.4z"/>`,
  briefcase: `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>`,
  receipt: `<path d="M6 2h12v19l-3-2-3 2-3-2-3 2V2z"/><path d="M9 8h6M9 12h6"/>`,
  wallet: `<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="15" r="1.2"/>`,
  users: `<circle cx="8.5" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 13.2c2.6.4 4.5 2.4 4.5 6.3"/>`,
  shield: `<path d="M12 2.5 20 6v6c0 5-3.5 8.5-8 9.5-4.5-1-8-4.5-8-9.5V6l8-3.5z"/><path d="M8.5 12l2.3 2.3L15.5 9.5"/>`,
  bed: `<path d="M3 18v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/><path d="M3 14h18"/><path d="M3 18v2M21 18v2"/><circle cx="7.5" cy="9.5" r="1.2"/>`,
  calendarDays: `<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><circle cx="8" cy="14" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>`,
  pieChart: `<path d="M12 2.5a9.5 9.5 0 1 0 9.5 9.5H12V2.5z"/><path d="M15.5 2.9A9.5 9.5 0 0 1 21.1 8.5H15.5V2.9z"/>`,
  fileText: `<path d="M6 2h9l5 5v15H6V2z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>`,
  folder: `<path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8A2 2 0 0 1 21 8.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.6 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.3-4.3"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  bell: `<path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9z"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/>`,
  logout: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>`,
  building: `<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h1M12 7h1M16 7h1M8 11h1M12 11h1M16 11h1M8 15h1M12 15h1M16 15h1M10 21v-4h4v4"/>`,
  arrowRight: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
};

export function icon(name, cls = "") {
  const p = ICON_PATHS[name] || ICON_PATHS.dashboard;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------
export const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "/", icon: "dashboard" },
  { key: "wedding", label: "Wedding Details", href: "/wedding", icon: "heart" },
  { key: "vendors", label: "Vendors", href: "/vendors", icon: "briefcase" },
  { key: "payments", label: "Payments", href: "/payments", icon: "wallet" },
  { key: "guests", label: "Guests", href: "/guests", icon: "users" },
  { key: "rooms", label: "Rooms", href: "/rooms", icon: "bed" },
  { key: "functions", label: "Functions / Events", href: "/functions", icon: "calendarDays" },
  { key: "budget", label: "Budget", href: "/budget", icon: "pieChart" },
  { key: "reports", label: "Reports", href: "/reports", icon: "fileText" },
  { key: "documents", label: "Documents", href: "/documents", icon: "folder" },
  { key: "settings", label: "Settings", href: "/settings", icon: "settings" },
];

// ---------------------------------------------------------------------------
// Layout shell
// ---------------------------------------------------------------------------
export function page({ user, active, title, content, flash }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)} — Wedding ERP</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">${icon("heart")}</div>
      <div>
        <div class="brand-name">Wedding ERP</div>
        <div class="brand-sub">Operations &amp; Finance</div>
      </div>
    </div>
    <nav class="nav">
      ${NAV_ITEMS.map(
        (item) => `
        <a href="${item.href}" class="nav-item ${active === item.key ? "active" : ""}">
          ${icon(item.icon, "nav-icon")}
          <span>${escapeHtml(item.label)}</span>
        </a>`
      ).join("")}
    </nav>
    <div class="sidebar-footer">
      <a href="/guest-links" class="nav-item subtle">${icon("arrowRight", "nav-icon")}<span>Guest Portal Links</span></a>
    </div>
  </aside>

  <div class="main-col">
    <header class="topbar">
      <form class="global-search" action="/search" method="GET">
        ${icon("search", "search-icon")}
        <input type="text" name="q" placeholder="Search vendors, guests, phone, room, payment..." autocomplete="off" />
      </form>
      <div class="topbar-right">
        ${user ? `<span class="role-pill">${escapeHtml(ROLE_LABELS[user.role] || user.role)}</span>
        <span class="who">${escapeHtml(user.name)}</span>
        <a href="/logout" class="icon-btn" title="Log out">${icon("logout")}</a>` : ""}
      </div>
    </header>
    ${flash ? `<div class="flash ${flash.type || "success"}">${escapeHtml(flash.message)}</div>` : ""}
    <main class="content">
      ${content}
    </main>
  </div>
</div>
<script src="/app.js"></script>
</body>
</html>`;
}

export function authPage({ title, content }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)} — Wedding ERP</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/styles.css" />
</head>
<body class="auth-body">
${content}
<script src="/app.js"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------
export function card(innerHtml, cls = "") {
  return `<div class="card ${cls}">${innerHtml}</div>`;
}

export function statTile({ label, value, sub, accent, href }) {
  const inner = `
    <div class="stat-label">${escapeHtml(label)}</div>
    <div class="stat-value">${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ""}`;
  const cls = `stat-tile ${accent ? "accent-" + accent : ""} ${href ? "stat-tile-link" : ""}`;
  return href ? `<a href="${href}" class="${cls}">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
}

export function badge(text, variant = "neutral") {
  return `<span class="badge badge-${variant}">${escapeHtml(text)}</span>`;
}

export function progressBar(pct, variant = "gold") {
  const clamped = Math.max(0, Math.min(100, pct));
  return `<div class="progress-track"><div class="progress-fill progress-${variant}" style="width:${clamped}%"></div></div>`;
}

export function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

export function alertItem({ severity, text, href }) {
  const content = `<span class="alert-dot alert-${severity}"></span><span>${text}</span>`;
  return href
    ? `<a href="${href}" class="alert-row">${content}</a>`
    : `<div class="alert-row">${content}</div>`;
}

// ---------------------------------------------------------------------------
// Charts — inline SVG, no client-side library.
// Palette follows the validated categorical/sequential set (see dataviz skill).
// ---------------------------------------------------------------------------
const SEQ_BLUE = "#2a78d6";
const SEQ_ORANGE = "#eb6834";
const SEQ_AQUA = "#1baf7a";
const GOOD = "#0ca30c";
const WARNING = "#d99a12";
const CRITICAL = "#d03b3b";

export const CHART_COLORS = { blue: SEQ_BLUE, orange: SEQ_ORANGE, aqua: SEQ_AQUA, good: GOOD, warning: WARNING, critical: CRITICAL };

export function hbarChart(entries, { color = SEQ_BLUE, formatter = formatINR, emptyText = "No data yet." } = {}) {
  if (!entries.length) return emptyState(emptyText);
  const max = Math.max(...entries.map((e) => e.value), 1);
  return `<div class="hbar-chart">
    ${entries
      .map((e) => {
        const pct = (e.value / max) * 100;
        const c = e.color || color;
        const row = `
          <div class="hbar-label" title="${escapeHtml(e.label)}">${escapeHtml(e.label)}</div>
          <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%; background:${c}"></div></div>
          <div class="hbar-value">${formatter(e.value)}</div>`;
        return e.href ? `<a href="${e.href}" class="hbar-row hbar-row-link">${row}</a>` : `<div class="hbar-row">${row}</div>`;
      })
      .join("")}
  </div>`;
}

export function stackedBar({ segments, formatter = formatINR }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return `<div class="stacked-bar-wrap">
    <div class="stacked-bar">
      ${segments
        .map((s) => `<div class="stacked-seg" style="width:${(s.value / total) * 100}%; background:${s.color}"></div>`)
        .join("")}
    </div>
    <div class="stacked-legend">
      ${segments
        .map(
          (s) => `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${escapeHtml(s.label)}: <strong>${formatter(s.value)}</strong></div>`
        )
        .join("")}
    </div>
  </div>`;
}

export function tabs(items, active) {
  return `<div class="tabbar">
    ${items.map((t) => `<a href="${t.href}" class="tabbtn ${active === t.key ? "active" : ""}">${escapeHtml(t.label)}</a>`).join("")}
  </div>`;
}
