import { all, get, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page, card, badge, progressBar, icon } from "../lib/render.js";
import { escapeHtml, formatINR, formatDate } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";
import { canWrite } from "../lib/constants.js";

function functionActual(id) {
  return get(`SELECT COALESCE(SUM(amount+tax),0) as t FROM expenses WHERE function_id = ?`, [id]).t;
}

function functionForm(f = {}) {
  return `
    <div class="field-row">
      <div class="field"><label>Function name *</label><input type="text" name="name" required value="${escapeHtml(f.name || "")}" placeholder="e.g. Sangeet" /></div>
      <div class="field"><label>Date</label><input type="date" name="date" value="${escapeHtml(f.date || "")}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Start time</label><input type="time" name="start_time" value="${escapeHtml(f.start_time || "")}" /></div>
      <div class="field"><label>End time</label><input type="time" name="end_time" value="${escapeHtml(f.end_time || "")}" /></div>
      <div class="field"><label>Expected guests</label><input type="number" name="expected_guests" value="${f.expected_guests || 0}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Venue</label><input type="text" name="venue" value="${escapeHtml(f.venue || "")}" /></div>
      <div class="field"><label>Budget (₹)</label><input type="number" name="budget" value="${f.budget || 0}" /></div>
    </div>
    <div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(f.notes || "")}</textarea></div>
  `;
}

export function registerFunctionRoutes(router) {
  router.get("/functions", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "functions");
    const functions = all(`SELECT * FROM functions ORDER BY date`);

    const cards = functions
      .map((f) => {
        const actual = functionActual(f.id);
        const pct = f.budget ? Math.round((actual / f.budget) * 100) : 0;
        const vendors = all(
          `SELECT v.* FROM vendors v JOIN vendor_functions vf ON vf.vendor_id = v.id WHERE vf.function_id = ?`,
          [f.id]
        );
        return `<div class="card">
          <div class="card-row">
            <div>
              <h2 style="margin-bottom:2px;"><a href="/functions/${f.id}">${escapeHtml(f.name)}</a></h2>
              <div class="small muted">${f.date ? formatDate(f.date) : "No date set"}${f.start_time ? " · " + f.start_time : ""}${f.venue ? " · " + escapeHtml(f.venue) : ""}</div>
            </div>
            ${badge(pct > 100 ? "Over budget" : "On track", pct > 100 ? "critical" : "good")}
          </div>
          <div class="kv-list" style="margin-bottom:10px;">
            <div class="kv-row"><span class="kv-label">Expected guests</span><span class="kv-value">${f.expected_guests || 0}</span></div>
            <div class="kv-row"><span class="kv-label">Budget</span><span class="kv-value">${formatINR(f.budget)}</span></div>
            <div class="kv-row"><span class="kv-label">Actual</span><span class="kv-value">${formatINR(actual)}</span></div>
          </div>
          ${progressBar(pct, pct > 100 ? "critical" : "gold")}
          <div class="small muted" style="margin:10px 0;">Vendors: ${vendors.length ? vendors.map((v) => escapeHtml(v.name)).join(", ") : "none linked yet"}</div>
          <a href="/functions/${f.id}" class="btn btn-secondary btn-sm">Open</a>
        </div>`;
      })
      .join("");

    const content = `
      <div class="page-head">
        <div><h1>Functions / Events</h1><p class="lede">Every ceremony, with its own budget and vendor list.</p></div>
      </div>
      ${canEdit ? `<a href="/functions/new" class="big-add-btn" style="margin-bottom:20px;">${icon("plus")}Add Function</a>` : ""}
      <div class="grid grid-2">${cards || `<div class="empty-state">No functions added yet.</div>`}</div>
    `;
    sendHtml(ctx.res, page({ user, active: "functions", title: "Functions", content }));
  });

  router.get("/functions/new", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "functions", "/functions")) return;
    const content = `
      <div class="page-head"><h1>Add Function</h1></div>
      <div class="card"><form method="POST" action="/functions">${functionForm()}<button type="submit" class="btn">Save function</button></form></div>`;
    sendHtml(ctx.res, page({ user, active: "functions", title: "Add Function", content }));
  });

  router.post("/functions", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "functions", "/functions")) return;
    const b = ctx.body;
    const result = run(
      `INSERT INTO functions (name, date, start_time, end_time, venue, expected_guests, budget, notes) VALUES (?,?,?,?,?,?,?,?)`,
      [b.name, b.date, b.start_time, b.end_time, b.venue, Number(b.expected_guests) || 0, Number(b.budget) || 0, b.notes]
    );
    logAudit(user, "CREATE", "function", Number(result.lastInsertRowid), b.name);
    redirect(ctx.res, "/functions");
  });

  router.get("/functions/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const f = get("SELECT * FROM functions WHERE id = ?", [ctx.params.id]);
    if (!f) return redirect(ctx.res, "/functions");
    const canEdit = canWrite(user.role, "functions");

    const actual = functionActual(f.id);
    const pct = f.budget ? Math.round((actual / f.budget) * 100) : 0;
    const linkedVendors = all(
      `SELECT v.* FROM vendors v JOIN vendor_functions vf ON vf.vendor_id = v.id WHERE vf.function_id = ? ORDER BY v.name`,
      [f.id]
    );
    const otherVendors = all(
      `SELECT * FROM vendors WHERE id NOT IN (SELECT vendor_id FROM vendor_functions WHERE function_id = ?) ORDER BY name`,
      [f.id]
    );
    const expenses = all(`SELECT * FROM expenses WHERE function_id = ? ORDER BY date DESC`, [f.id]);

    const content = `
      <div class="page-head">
        <div><h1>${escapeHtml(f.name)}</h1><p class="lede">${f.date ? formatDate(f.date) : "No date"}${f.venue ? " · " + escapeHtml(f.venue) : ""}</p></div>
        ${canEdit ? `<div style="display:flex;gap:8px;"><a href="/functions/${f.id}/edit" class="btn btn-secondary">Edit</a>
        <form method="POST" action="/functions/${f.id}/delete" data-confirm="Delete this function?"><button class="btn btn-danger">Delete</button></form></div>` : ""}
      </div>

      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-label">Expected guests</div><div class="stat-value">${f.expected_guests || 0}</div></div>
        <div class="stat-tile"><div class="stat-label">Budget</div><div class="stat-value">${formatINR(f.budget)}</div></div>
        <div class="stat-tile accent-${pct > 100 ? "critical" : "good"}"><div class="stat-label">Actual</div><div class="stat-value">${formatINR(actual)}</div></div>
        <div class="stat-tile"><div class="stat-label">% Used</div><div class="stat-value">${pct}%</div></div>
      </div>
      ${progressBar(pct, pct > 100 ? "critical" : "gold")}

      <div class="grid grid-2" style="margin-top:20px;">
        <div class="card">
          <h2>Linked vendors</h2>
          ${linkedVendors.length ? `<div class="pill-row" style="margin-bottom:14px;">${linkedVendors
            .map(
              (v) => `<span class="badge badge-gold">${escapeHtml(v.name)} ${canEdit ? `<form method="POST" action="/functions/${f.id}/vendors/${v.id}/remove" style="display:inline;"><button class="btn-sm" style="background:none;border:none;color:inherit;cursor:pointer;padding:0 0 0 4px;">✕</button></form>` : ""}</span>`
            )
            .join("")}</div>` : `<div class="empty-state">No vendors linked yet.</div>`}
          ${canEdit && otherVendors.length ? `
          <form method="POST" action="/functions/${f.id}/vendors" class="field-row" style="align-items:end;">
            <div class="field"><label>Add a vendor to this function</label>
              <select name="vendor_id">${otherVendors.map((v) => `<option value="${v.id}">${escapeHtml(v.name)} (${escapeHtml(v.category)})</option>`).join("")}</select>
            </div>
            <div class="field"><button class="btn btn-secondary">Link vendor</button></div>
          </form>` : ""}
        </div>
        <div class="card">
          <h2>Expenses for this function</h2>
          ${expenses.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th></tr></thead><tbody>
            ${expenses.map((e) => `<tr><td>${formatDate(e.date)}</td><td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.description)}</td><td class="num">${formatINR(e.amount + e.tax)}</td></tr>`).join("")}
          </tbody></table></div>` : `<div class="empty-state">No expenses logged for this function yet.</div>`}
          <a href="/expenses/new?function_id=${f.id}" class="btn btn-secondary btn-sm" style="margin-top:12px;">+ Add expense</a>
        </div>
      </div>
      ${f.notes ? `<div class="card" style="margin-top:18px;"><h2>Notes</h2><p>${escapeHtml(f.notes)}</p></div>` : ""}
    `;
    sendHtml(ctx.res, page({ user, active: "functions", title: f.name, content }));
  });

  router.get("/functions/:id/edit", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "functions", "/functions")) return;
    const f = get("SELECT * FROM functions WHERE id = ?", [ctx.params.id]);
    if (!f) return redirect(ctx.res, "/functions");
    const content = `
      <div class="page-head"><h1>Edit ${escapeHtml(f.name)}</h1></div>
      <div class="card"><form method="POST" action="/functions/${f.id}">${functionForm(f)}<button type="submit" class="btn">Save changes</button></form></div>`;
    sendHtml(ctx.res, page({ user, active: "functions", title: "Edit Function", content }));
  });

  router.post("/functions/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "functions", "/functions")) return;
    const b = ctx.body;
    run(
      `UPDATE functions SET name=?, date=?, start_time=?, end_time=?, venue=?, expected_guests=?, budget=?, notes=? WHERE id=?`,
      [b.name, b.date, b.start_time, b.end_time, b.venue, Number(b.expected_guests) || 0, Number(b.budget) || 0, b.notes, ctx.params.id]
    );
    logAudit(user, "UPDATE", "function", Number(ctx.params.id), b.name);
    redirect(ctx.res, `/functions/${ctx.params.id}`);
  });

  router.post("/functions/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "functions", "/functions")) return;
    run(`DELETE FROM functions WHERE id = ?`, [ctx.params.id]);
    logAudit(user, "DELETE", "function", Number(ctx.params.id), "");
    redirect(ctx.res, "/functions");
  });

  router.post("/functions/:id/vendors", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "functions", "/functions")) return;
    run(`INSERT OR IGNORE INTO vendor_functions (vendor_id, function_id) VALUES (?, ?)`, [ctx.body.vendor_id, ctx.params.id]);
    redirect(ctx.res, `/functions/${ctx.params.id}`);
  });

  router.post("/functions/:id/vendors/:vendorId/remove", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "functions", "/functions")) return;
    run(`DELETE FROM vendor_functions WHERE vendor_id = ? AND function_id = ?`, [ctx.params.vendorId, ctx.params.id]);
    redirect(ctx.res, `/functions/${ctx.params.id}`);
  });
}
