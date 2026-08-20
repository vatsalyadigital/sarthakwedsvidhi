import { all, get, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page, badge, icon, emptyState } from "../lib/render.js";
import { escapeHtml, formatINR, formatDate } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";
import { canWrite, PAYMENT_MODES, PAYMENT_STATUSES } from "../lib/constants.js";

function ensureCategory(name) {
  if (!name) return;
  const exists = get("SELECT id FROM expense_categories WHERE name = ?", [name]);
  if (!exists) run("INSERT INTO expense_categories (name, budget) VALUES (?, 0)", [name]);
}

function statusVariant(status) {
  return status === "Paid" ? "good" : status === "Partially Paid" ? "warning" : "critical";
}

function expenseForm({ e = {}, vendors, functions, categories, prefillVendor, prefillFunction }) {
  return `
    <div class="field-row">
      <div class="field"><label>Date *</label><input type="date" name="date" required value="${escapeHtml(e.date || new Date().toISOString().slice(0, 10))}" /></div>
      <div class="field"><label>Category *</label>
        <input list="category-list" name="category" required value="${escapeHtml(e.category || "")}" placeholder="Pick or type a new category" />
        <datalist id="category-list">${categories.map((c) => `<option value="${escapeHtml(c.name)}">`).join("")}</datalist>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Vendor</label><select name="vendor_id"><option value="">— none —</option>
        ${vendors.map((v) => `<option value="${v.id}" ${String(e.vendor_id) === String(v.id) || (!e.id && prefillVendor === String(v.id)) ? "selected" : ""}>${escapeHtml(v.name)}</option>`).join("")}
      </select></div>
      <div class="field"><label>Function</label><select name="function_id"><option value="">— none —</option>
        ${functions.map((f) => `<option value="${f.id}" ${String(e.function_id) === String(f.id) || (!e.id && prefillFunction === String(f.id)) ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}
      </select></div>
    </div>
    <div class="field"><label>Description</label><input type="text" name="description" value="${escapeHtml(e.description || "")}" /></div>
    <div class="field-row">
      <div class="field"><label>Amount (₹) *</label><input type="number" name="amount" required value="${e.amount || 0}" /></div>
      <div class="field"><label>Tax (₹)</label><input type="number" name="tax" value="${e.tax || 0}" /></div>
      <div class="field"><label>Payment status</label><select name="payment_status">${PAYMENT_STATUSES.map((s) => `<option ${e.payment_status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Payment method</label><select name="payment_method"><option value="">—</option>${PAYMENT_MODES.map((m) => `<option ${e.payment_method === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
      <div class="field"><label>Paid by</label><input type="text" name="paid_by" value="${escapeHtml(e.paid_by || "")}" /></div>
    </div>
    <div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(e.notes || "")}</textarea></div>
  `;
}

export function registerExpenseRoutes(router) {
  router.get("/expenses", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "expenses");
    const { vendor_id, category, function_id, payment_status, payment_method, from, to } = ctx.query;

    let sql = `SELECT e.*, v.name as vendor_name, f.name as function_name FROM expenses e
      LEFT JOIN vendors v ON v.id = e.vendor_id LEFT JOIN functions f ON f.id = e.function_id WHERE 1=1`;
    const params = [];
    if (vendor_id) { sql += " AND e.vendor_id = ?"; params.push(vendor_id); }
    if (category) { sql += " AND e.category = ?"; params.push(category); }
    if (function_id) { sql += " AND e.function_id = ?"; params.push(function_id); }
    if (payment_status) { sql += " AND e.payment_status = ?"; params.push(payment_status); }
    if (payment_method) { sql += " AND e.payment_method = ?"; params.push(payment_method); }
    if (from) { sql += " AND e.date >= ?"; params.push(from); }
    if (to) { sql += " AND e.date <= ?"; params.push(to); }
    sql += " ORDER BY e.date DESC, e.id DESC";
    const expenses = all(sql, params);
    const total = expenses.reduce((s, e) => s + e.amount + e.tax, 0);

    const vendors = all("SELECT id, name FROM vendors ORDER BY name");
    const functions = all("SELECT id, name FROM functions ORDER BY name");
    const categories = all("SELECT * FROM expense_categories ORDER BY name");

    const rows = expenses
      .map(
        (e) => `<tr>
        <td>${formatDate(e.date)}</td>
        <td>${badge(e.category, "neutral")}</td>
        <td>${e.vendor_name ? `<a href="/vendors/${e.vendor_id}">${escapeHtml(e.vendor_name)}</a>` : "—"}</td>
        <td>${e.function_name ? `<a href="/functions/${e.function_id}">${escapeHtml(e.function_name)}</a>` : "—"}</td>
        <td class="small">${escapeHtml(e.description || "")}</td>
        <td class="num">${formatINR(e.amount + e.tax)}</td>
        <td>${badge(e.payment_status, statusVariant(e.payment_status))}</td>
        <td>${canEdit ? `<div style="display:flex;gap:6px;"><a href="/expenses/${e.id}/edit" class="btn btn-secondary btn-sm">Edit</a>
          <form method="POST" action="/expenses/${e.id}/delete" data-confirm="Delete this expense?"><button class="btn btn-danger btn-sm">Delete</button></form></div>` : ""}</td>
      </tr>`
      )
      .join("");

    const content = `
      <div class="page-head">
        <div><h1>Expenses</h1><p class="lede">Centralized log of every wedding expense — total shown: <strong>${formatINR(total)}</strong></p></div>
        ${canEdit ? `<a href="/expenses/new" class="btn">${icon("plus")}Add Expense</a>` : ""}
      </div>
      <div class="card">
        <form class="filter-bar" method="GET" action="/expenses">
          <select name="vendor_id" onchange="this.form.submit()"><option value="">All vendors</option>${vendors.map((v) => `<option value="${v.id}" ${vendor_id === String(v.id) ? "selected" : ""}>${escapeHtml(v.name)}</option>`).join("")}</select>
          <select name="category" onchange="this.form.submit()"><option value="">All categories</option>${categories.map((c) => `<option value="${escapeHtml(c.name)}" ${category === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select>
          <select name="function_id" onchange="this.form.submit()"><option value="">All functions</option>${functions.map((f) => `<option value="${f.id}" ${function_id === String(f.id) ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}</select>
          <select name="payment_status" onchange="this.form.submit()"><option value="">Any status</option>${PAYMENT_STATUSES.map((s) => `<option ${payment_status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          <select name="payment_method" onchange="this.form.submit()"><option value="">Any method</option>${PAYMENT_MODES.map((m) => `<option ${payment_method === m ? "selected" : ""}>${m}</option>`).join("")}</select>
          <input type="date" name="from" value="${escapeHtml(from || "")}" onchange="this.form.submit()" />
          <input type="date" name="to" value="${escapeHtml(to || "")}" onchange="this.form.submit()" />
          <a href="/expenses" class="btn btn-secondary btn-sm">Clear</a>
          <a href="/reports/expenses.csv?${new URLSearchParams(ctx.query).toString()}" class="btn btn-secondary btn-sm">Export CSV</a>
        </form>
        <div class="table-wrap">
          <table><thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Function</th><th>Description</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="8">${emptyState("No expenses match these filters.")}</td></tr>`}</tbody></table>
        </div>
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "expenses", title: "Expenses", content }));
  });

  router.get("/expenses/new", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "expenses", "/expenses")) return;
    const vendors = all("SELECT id, name FROM vendors ORDER BY name");
    const functions = all("SELECT id, name FROM functions ORDER BY name");
    const categories = all("SELECT * FROM expense_categories ORDER BY name");
    const content = `
      <div class="page-head"><h1>Add Expense</h1></div>
      <div class="card"><form method="POST" action="/expenses">
        ${expenseForm({ vendors, functions, categories, prefillVendor: ctx.query.vendor_id, prefillFunction: ctx.query.function_id })}
        <button type="submit" class="btn btn-lg">Save expense</button>
      </form></div>
    `;
    sendHtml(ctx.res, page({ user, active: "expenses", title: "Add Expense", content }));
  });

  router.post("/expenses", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "expenses", "/expenses")) return;
    const b = ctx.body;
    ensureCategory(b.category);
    const result = run(
      `INSERT INTO expenses (date, category, vendor_id, function_id, description, amount, tax, payment_status, payment_method, paid_by, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [b.date, b.category, b.vendor_id || null, b.function_id || null, b.description, Number(b.amount) || 0, Number(b.tax) || 0, b.payment_status || "Unpaid", b.payment_method || null, b.paid_by, b.notes]
    );
    logAudit(user, "CREATE", "expense", Number(result.lastInsertRowid), b.description);
    redirect(ctx.res, "/expenses");
  });

  router.get("/expenses/:id/edit", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "expenses", "/expenses")) return;
    const e = get("SELECT * FROM expenses WHERE id = ?", [ctx.params.id]);
    if (!e) return redirect(ctx.res, "/expenses");
    const vendors = all("SELECT id, name FROM vendors ORDER BY name");
    const functions = all("SELECT id, name FROM functions ORDER BY name");
    const categories = all("SELECT * FROM expense_categories ORDER BY name");
    const content = `
      <div class="page-head"><h1>Edit Expense</h1></div>
      <div class="card"><form method="POST" action="/expenses/${e.id}">
        ${expenseForm({ e, vendors, functions, categories })}
        <button type="submit" class="btn btn-lg">Save changes</button>
      </form></div>
    `;
    sendHtml(ctx.res, page({ user, active: "expenses", title: "Edit Expense", content }));
  });

  router.post("/expenses/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "expenses", "/expenses")) return;
    const b = ctx.body;
    ensureCategory(b.category);
    run(
      `UPDATE expenses SET date=?, category=?, vendor_id=?, function_id=?, description=?, amount=?, tax=?, payment_status=?, payment_method=?, paid_by=?, notes=? WHERE id=?`,
      [b.date, b.category, b.vendor_id || null, b.function_id || null, b.description, Number(b.amount) || 0, Number(b.tax) || 0, b.payment_status || "Unpaid", b.payment_method || null, b.paid_by, b.notes, ctx.params.id]
    );
    logAudit(user, "UPDATE", "expense", Number(ctx.params.id), b.description);
    redirect(ctx.res, "/expenses");
  });

  router.post("/expenses/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "expenses", "/expenses")) return;
    run("DELETE FROM expenses WHERE id = ?", [ctx.params.id]);
    logAudit(user, "DELETE", "expense", Number(ctx.params.id), "");
    redirect(ctx.res, "/expenses");
  });
}
