import { all, get } from "../lib/db.js";
import { requireUser } from "../lib/guard.js";
import { sendHtml } from "../lib/router.js";
import { page, statTile, hbarChart, stackedBar, alertItem, CHART_COLORS, icon } from "../lib/render.js";
import { formatINR, formatDate } from "../lib/format.js";
import { dashboardTotals, vendorSummary } from "../lib/calc.js";
import { computeAlerts } from "../lib/alerts.js";

export function registerDashboardRoutes(router) {
  router.get("/", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;

    const totals = dashboardTotals();
    const wedding = totals.wedding;

    const today = new Date().toISOString().slice(0, 10);
    const upcomingPayments = get(
      `SELECT COUNT(*) as c FROM vendors WHERE next_payment_due_date IS NOT NULL AND next_payment_due_date != '' AND next_payment_due_date >= ?`,
      [today]
    ).c;
    const upcomingFunctions = get(`SELECT COUNT(*) as c FROM functions WHERE date >= ?`, [today]).c;

    let daysToGo = "";
    if (wedding?.wedding_date) {
      const d = Math.ceil((new Date(wedding.wedding_date) - new Date(today)) / 86400000);
      daysToGo = d >= 0 ? `${d} day${d === 1 ? "" : "s"} to go` : "";
    }

    const stats = [
      { label: "Total Wedding Budget", value: formatINR(totals.totalBudget), sub: wedding?.wedding_date ? formatDate(wedding.wedding_date) + (daysToGo ? " · " + daysToGo : "") : "", href: "/wedding" },
      { label: "Total Estimated Cost", value: formatINR(totals.totalEstimated), sub: "Sum of final vendor contracts", accent: "gold", href: "/reports/financial" },
      { label: "Total Paid", value: formatINR(totals.totalPaid), sub: "Vendor payments", accent: "good", href: "/reports/financial" },
      { label: "Total Outstanding", value: formatINR(totals.totalOutstanding), sub: "Still owed", accent: totals.totalOutstanding > 0 ? "warning" : "good", href: "/reports/financial" },
      { label: "Vendors", value: String(totals.vendorCount), sub: "onboarded", href: "/vendors" },
      { label: "Guests", value: String(totals.guestCount), sub: "in the guest list", href: "/guests" },
      { label: "Rooms Allocated", value: String(totals.roomsAllocated), sub: `of ${totals.totalRooms} total`, accent: "good", href: "/rooms" },
      { label: "Rooms Pending", value: String(totals.roomsPending), sub: "not yet allocated", accent: totals.roomsPending > 0 ? "warning" : "good", href: "/rooms" },
      { label: "Upcoming Payments", value: String(upcomingPayments), sub: "due soon", href: "/vendors" },
      { label: "Upcoming Functions", value: String(upcomingFunctions), sub: "scheduled ahead", href: "/functions" },
    ];

    // Vendor-wise spending (final contract amount per vendor)
    const vendors = all(`SELECT * FROM vendors`);
    const vendorSpend = vendors
      .map((v) => ({ label: v.name, value: vendorSummary(v).finalAmount, href: `/vendors/${v.id}` }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const alerts = computeAlerts();

    const content = `
      <div class="page-head">
        <div>
          <h1>${wedding?.wedding_name ? wedding.wedding_name : "Wedding Dashboard"}</h1>
          <p class="lede">A complete view of your wedding operations and finances.</p>
        </div>
        <a href="/vendors/new" class="btn">${icon("plus")}Add Vendor</a>
      </div>

      <div class="stat-grid">
        ${stats.map(statTile).join("")}
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2><a href="/reports/financial" class="card-title-link">Paid vs Outstanding</a></h2>
          ${stackedBar({
            segments: [
              { label: "Paid", value: totals.totalPaid, color: CHART_COLORS.good },
              { label: "Outstanding", value: totals.totalOutstanding, color: CHART_COLORS.warning },
            ],
          })}
        </div>
        <div class="card">
          <h2><a href="/vendors" class="card-title-link">Vendor-wise Spending</a></h2>
          ${hbarChart(vendorSpend, { color: CHART_COLORS.aqua, emptyText: "No vendor spending yet." })}
        </div>
      </div>

      <div class="card" style="margin-top:18px;">
        <h2>Alerts</h2>
        ${
          alerts.length
            ? alerts.slice(0, 10).map(alertItem).join("")
            : `<div class="empty-state">All clear — no alerts right now.</div>`
        }
      </div>
    `;

    sendHtml(ctx.res, page({ user, active: "dashboard", title: "Dashboard", content }));
  });
}
