import { all, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page, progressBar, badge, icon, emptyState } from "../lib/render.js";
import { escapeHtml, formatINR } from "../lib/format.js";
import { canWrite } from "../lib/constants.js";
import { categoryEstimated } from "../lib/calc.js";
import { logAudit } from "../lib/audit.js";

export function registerBudgetRoutes(router) {
  router.get("/budget", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "budget");
    const categories = all("SELECT * FROM budget_categories ORDER BY name");

    const rows = categories.map((c) => {
      const estimated = categoryEstimated(c.name);
      const variance = c.budget - estimated;
      const pct = c.budget ? Math.round((estimated / c.budget) * 100) : estimated > 0 ? 100 : 0;
      const over = c.budget > 0 && estimated > c.budget;
      return { c, estimated, variance, pct, over };
    });

    const totalBudget = categories.reduce((s, c) => s + (c.budget || 0), 0);
    const totalEstimated = rows.reduce((s, r) => s + r.estimated, 0);

    const content = `
      <div class="page-head">
        <div><h1>Budget</h1><p class="lede">Budget vs estimated cost (final vendor rates) by category.</p></div>
      </div>

      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-label">Total Budget</div><div class="stat-value">${formatINR(totalBudget)}</div></div>
        <div class="stat-tile accent-${totalEstimated > totalBudget ? "critical" : "good"}"><div class="stat-label">Total Estimated Cost</div><div class="stat-value">${formatINR(totalEstimated)}</div></div>
        <div class="stat-tile"><div class="stat-label">Remaining</div><div class="stat-value">${formatINR(totalBudget - totalEstimated)}</div></div>
      </div>

      ${canEdit ? `<div class="card">
        <h2>Add a category</h2>
        <form method="POST" action="/budget/categories" class="field-row" style="align-items:end;">
          <div class="field"><label>Category name</label><input type="text" name="name" required /></div>
          <div class="field"><label>Budget (₹)</label><input type="number" name="budget" value="0" /></div>
          <div class="field"><button class="btn">${icon("plus")}Add category</button></div>
        </form>
      </div>` : ""}

      <div class="card">
        <h2>Categories</h2>
        <p class="small secondary-text">"Estimated Cost" is the sum of final contract rates (after discount and tax) for every vendor in that category.</p>
        ${rows
          .map(
            ({ c, estimated, variance, pct, over }) => `
          <div style="margin-bottom:20px;">
            <div class="card-row" style="margin-bottom:6px;">
              <div><strong>${escapeHtml(c.name)}</strong> ${over ? badge("Over budget", "critical") : ""}</div>
              <div class="small muted">${pct}% used</div>
            </div>
            ${progressBar(pct, over ? "critical" : pct > 85 ? "warning" : "gold")}
            <div class="kv-list" style="margin-top:8px;flex-direction:row;flex-wrap:wrap;gap:18px;">
              <span class="small muted">Budget: <strong class="secondary-text">${formatINR(c.budget)}</strong></span>
              <span class="small muted">Estimated Cost: <strong class="secondary-text">${formatINR(estimated)}</strong></span>
              <span class="small muted">Variance: <strong class="secondary-text">${formatINR(variance)}</strong></span>
            </div>
            ${canEdit ? `<form method="POST" action="/budget/categories/${c.id}" class="field-row" style="margin-top:10px;align-items:end;">
              <div class="field"><label>Budget (₹)</label><input type="number" name="budget" value="${c.budget}" /></div>
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
    run("INSERT OR IGNORE INTO budget_categories (name, budget) VALUES (?, ?)", [b.name, Number(b.budget) || 0]);
    logAudit(user, "CREATE", "budget_category", null, b.name);
    redirect(ctx.res, "/budget");
  });

  router.post("/budget/categories/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "budget", "/budget")) return;
    const b = ctx.body;
    run("UPDATE budget_categories SET budget=? WHERE id=?", [Number(b.budget) || 0, ctx.params.id]);
    redirect(ctx.res, "/budget");
  });

  router.post("/budget/categories/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "budget", "/budget")) return;
    run("DELETE FROM budget_categories WHERE id=?", [ctx.params.id]);
    redirect(ctx.res, "/budget");
  });
}
