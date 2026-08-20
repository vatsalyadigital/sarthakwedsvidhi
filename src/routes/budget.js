import { all, get, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page, progressBar, badge, icon, emptyState } from "../lib/render.js";
import { escapeHtml, formatINR } from "../lib/format.js";
import { canWrite } from "../lib/constants.js";
import { logAudit } from "../lib/audit.js";

export function registerBudgetRoutes(router) {
  router.get("/budget", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "budget");
    const categories = all("SELECT * FROM expense_categories ORDER BY name");

    const rows = categories.map((c) => {
      const actual = get("SELECT COALESCE(SUM(amount+tax),0) as t FROM expenses WHERE category = ?", [c.name]).t;
      const variance = c.budget - actual;
      const pct = c.budget ? Math.round((actual / c.budget) * 100) : actual > 0 ? 100 : 0;
      const over = c.budget > 0 && actual > c.budget;
      return { c, actual, variance, pct, over };
    });

    const totalBudget = categories.reduce((s, c) => s + (c.budget || 0), 0);
    const totalEstimated = categories.reduce((s, c) => s + (c.estimated || 0), 0);
    const totalActual = rows.reduce((s, r) => s + r.actual, 0);

    const content = `
      <div class="page-head">
        <div><h1>Budget</h1><p class="lede">Budget, estimate, and actual spend by category.</p></div>
      </div>

      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-label">Total Budget</div><div class="stat-value">${formatINR(totalBudget)}</div></div>
        <div class="stat-tile"><div class="stat-label">Total Estimated</div><div class="stat-value">${formatINR(totalEstimated)}</div></div>
        <div class="stat-tile accent-${totalActual > totalBudget ? "critical" : "good"}"><div class="stat-label">Total Actual</div><div class="stat-value">${formatINR(totalActual)}</div></div>
        <div class="stat-tile"><div class="stat-label">Remaining</div><div class="stat-value">${formatINR(totalBudget - totalActual)}</div></div>
      </div>

      ${canEdit ? `<div class="card">
        <h2>Add a category</h2>
        <form method="POST" action="/budget/categories" class="field-row" style="align-items:end;">
          <div class="field"><label>Category name</label><input type="text" name="name" required /></div>
          <div class="field"><label>Budget (₹)</label><input type="number" name="budget" value="0" /></div>
          <div class="field"><label>Estimated (₹)</label><input type="number" name="estimated" value="0" /></div>
          <div class="field"><button class="btn">${icon("plus")}Add category</button></div>
        </form>
      </div>` : ""}

      <div class="card">
        <h2>Categories</h2>
        ${rows
          .map(
            ({ c, actual, variance, pct, over }) => `
          <div style="margin-bottom:20px;">
            <div class="card-row" style="margin-bottom:6px;">
              <div><strong>${escapeHtml(c.name)}</strong> ${over ? badge("Over budget", "critical") : ""}</div>
              <div class="small muted">${pct}% used</div>
            </div>
            ${progressBar(pct, over ? "critical" : pct > 85 ? "warning" : "gold")}
            <div class="kv-list" style="margin-top:8px;flex-direction:row;flex-wrap:wrap;gap:18px;">
              <span class="small muted">Budget: <strong class="secondary-text">${formatINR(c.budget)}</strong></span>
              <span class="small muted">Estimated: <strong class="secondary-text">${formatINR(c.estimated)}</strong></span>
              <span class="small muted">Actual: <strong class="secondary-text">${formatINR(actual)}</strong></span>
              <span class="small muted">Variance: <strong class="secondary-text">${formatINR(variance)}</strong></span>
            </div>
            ${canEdit ? `<form method="POST" action="/budget/categories/${c.id}" class="field-row" style="margin-top:10px;align-items:end;">
              <div class="field"><label>Budget (₹)</label><input type="number" name="budget" value="${c.budget}" /></div>
              <div class="field"><label>Estimated (₹)</label><input type="number" name="estimated" value="${c.estimated}" /></div>
              <div class="field"><button class="btn btn-secondary btn-sm">Update</button></div>
              <div class="field"><button formaction="/budget/categories/${c.id}/delete" formmethod="POST" class="btn btn-danger btn-sm" data-confirm="Delete this category?">Delete</button></div>
            </form>` : ""}
          </div>`
          )
          .join("") || emptyState("No categories yet.")}
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "budget", title: "Budget", content }));
  });

  router.post("/budget/categories", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "budget", "/budget")) return;
    const b = ctx.body;
    run("INSERT OR IGNORE INTO expense_categories (name, budget, estimated) VALUES (?, ?, ?)", [b.name, Number(b.budget) || 0, Number(b.estimated) || 0]);
    logAudit(user, "CREATE", "expense_category", null, b.name);
    redirect(ctx.res, "/budget");
  });

  router.post("/budget/categories/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "budget", "/budget")) return;
    const b = ctx.body;
    run("UPDATE expense_categories SET budget=?, estimated=? WHERE id=?", [Number(b.budget) || 0, Number(b.estimated) || 0, ctx.params.id]);
    redirect(ctx.res, "/budget");
  });

  router.post("/budget/categories/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "budget", "/budget")) return;
    run("DELETE FROM expense_categories WHERE id=?", [ctx.params.id]);
    redirect(ctx.res, "/budget");
  });
}
