import { all, get } from "../lib/db.js";
import { requireUser } from "../lib/guard.js";
import { sendHtml } from "../lib/router.js";
import { page, card, statTile, hbarChart, stackedBar, alertItem, CHART_COLORS, icon } from "../lib/render.js";
import { formatINR, formatDate } from "../lib/format.js";
import { dashboardTotals, vendorSummary, categoryEstimated } from "../lib/calc.js";
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
      { label: "Total Wedding Budget", value: formatINR(totals.totalBudget), sub: wedding?.wedding_date ? formatDate(wedding.wedding_date) + (daysToGo ? " · " + daysToGo : "") : "" },
      { label: "Total Estimated Cost", value: formatINR(totals.totalEstimated), sub: "Sum of final vendor contracts", accent: "gold" },
      { label: "Total Paid", value: formatINR(totals.totalPaid), sub: "Vendor payments", accent: "good" },
      { label: "Total Outstanding", value: formatINR(totals.totalOutstanding), sub: "Still owed", accent: totals.totalOutstanding > 0 ? "warning" : "good" },
      { label: "Vendors", value: String(totals.vendorCount), sub: "onboarded" },
      { label: "Guests", value: String(totals.guestCount), sub: "in the guest list" },
      { label: "Rooms Allocated", value: String(totals.roomsAllocated), sub: `of ${totals.totalRooms} total`, accent: "good" },
      { label: "Rooms Pending", value: String(totals.roomsPending), sub: "not yet allocated", accent: totals.roomsPending > 0 ? "warning" : "good" },
      { label: "Upcoming Payments", value: String(upcomingPayments), sub: "due soon" },
      { label: "Upcoming Functions", value: String(upcomingFunctions), sub: "scheduled ahead" },
    ];

    // Estimated cost by category (final vendor rates, grouped by vendor category)
    const byCategory = all(`SELECT DISTINCT category FROM vendors`)
      .map((r) => ({ label: r.category, value: categoryEstimated(r.category) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);

    // Vendor-wise spending (final contract amount per vendor)
    const vendors = all(`SELECT * FROM vendors`);
    const vendorSpend = vendors
      .map((v) => ({ label: v.name, value: vendorSummary(v).finalAmount }))
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
          <h2>Budget vs Estimated Cost</h2>
          ${hbarChart(
            [
              { label: "Budget", value: totals.totalBudget, color: "#c9bda0" },
              { label: "Estimated", value: totals.totalEstimated, color: totals.totalEstimated > totals.totalBudget ? CHART_COLORS.critical : CHART_COLORS.good },
            ],
            { emptyText: "Set a wedding budget to see this chart." }
          )}
        </div>
        <div class="card">
          <h2>Paid vs Outstanding</h2>
          ${stackedBar({
            segments: [
              { label: "Paid", value: totals.totalPaid, color: CHART_COLORS.good },
              { label: "Outstanding", value: totals.totalOutstanding, color: CHART_COLORS.warning },
            ],
          })}
        </div>
      </div>

      <div class="grid grid-2" style="margin-top:18px;">
        <div class="card">
          <h2>Estimated Cost by Category</h2>
          ${hbarChart(byCategory, { color: CHART_COLORS.blue, emptyText: "No vendors with a category yet." })}
        </div>
        <div class="card">
          <h2>Vendor-wise Spending</h2>
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
