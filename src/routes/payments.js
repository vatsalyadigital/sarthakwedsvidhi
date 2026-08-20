import { all, get, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page, badge, icon, emptyState } from "../lib/render.js";
import { escapeHtml, formatINR, formatDate } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";
import { canWrite, PAYMENT_MODES } from "../lib/constants.js";

export function registerPaymentRoutes(router) {
  router.get("/payments", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "payments");

    const payments = all(
      `SELECT p.*, v.name as vendor_name FROM vendor_payments p JOIN vendors v ON v.id = p.vendor_id ORDER BY p.payment_date DESC, p.id DESC`
    );
    const vendors = all("SELECT * FROM vendors ORDER BY name");
    const total = payments.reduce((s, p) => s + p.amount, 0);

    const today = new Date().toISOString().slice(0, 10);
    const upcoming = all(
      `SELECT * FROM vendors WHERE next_payment_due_date IS NOT NULL AND next_payment_due_date != '' ORDER BY next_payment_due_date`
    );

    const rows = payments
      .map(
        (p) => `<tr>
        <td>${formatDate(p.payment_date)}</td>
        <td><a href="/vendors/${p.vendor_id}">${escapeHtml(p.vendor_name)}</a></td>
        <td class="num">${formatINR(p.amount)}</td>
        <td>${badge(p.mode, "neutral")}</td>
        <td class="small">${escapeHtml(p.transaction_ref || "—")}</td>
        <td class="small">${escapeHtml(p.paid_by || "—")}</td>
        <td>${canEdit ? `<form method="POST" action="/vendors/${p.vendor_id}/payments/${p.id}/delete" data-confirm="Delete this payment?"><button class="btn btn-danger btn-sm">Delete</button></form>` : ""}</td>
      </tr>`
      )
      .join("");

    const content = `
      <div class="page-head">
        <div><h1>Payments</h1><p class="lede">Every payment made to a vendor — total paid: <strong>${formatINR(total)}</strong></p></div>
      </div>

      ${canEdit ? `<div class="card">
        <h2>Record a payment</h2>
        <form method="POST" action="/payments" class="field-row" style="align-items:end;">
          <div class="field"><label>Vendor *</label><select name="vendor_id" required><option value="">Select vendor</option>${vendors.map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("")}</select></div>
          <div class="field"><label>Date *</label><input type="date" name="payment_date" required value="${today}" /></div>
          <div class="field"><label>Amount (₹) *</label><input type="number" name="amount" required /></div>
          <div class="field"><label>Mode</label><select name="mode">${PAYMENT_MODES.map((m) => `<option>${m}</option>`).join("")}</select></div>
          <div class="field"><label>Transaction ID</label><input type="text" name="transaction_ref" /></div>
          <div class="field"><label>Paid by</label><input type="text" name="paid_by" /></div>
          <div class="field"><button class="btn">${icon("plus")}Add</button></div>
        </form>
      </div>` : ""}

      <div class="card">
        <h2>Upcoming / recent due dates</h2>
        ${upcoming.length ? upcoming.map((v) => `<div class="kv-row" style="padding:8px 0;border-bottom:1px solid var(--border);"><span><a href="/vendors/${v.id}">${escapeHtml(v.name)}</a> <span class="small muted">${formatDate(v.next_payment_due_date)}</span></span><strong>${formatINR(v.next_payment_amount)}</strong></div>`).join("") : emptyState("No upcoming payments scheduled. Set a next payment date on a vendor's Contract tab.")}
      </div>

      <div class="card">
        <h2>Payment history</h2>
        <div class="table-wrap">
          <table><thead><tr><th>Date</th><th>Vendor</th><th class="num">Amount</th><th>Mode</th><th>Reference</th><th>Paid by</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7">${emptyState("No payments recorded yet.")}</td></tr>`}</tbody></table>
        </div>
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "payments", title: "Payments", content }));
  });

  router.post("/payments", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "payments", "/payments")) return;
    const b = ctx.body;
    if (!b.vendor_id) return redirect(ctx.res, "/payments");
    const result = run(
      `INSERT INTO vendor_payments (vendor_id, payment_date, amount, mode, transaction_ref, paid_by, notes) VALUES (?,?,?,?,?,?,?)`,
      [b.vendor_id, b.payment_date, Number(b.amount) || 0, b.mode, b.transaction_ref, b.paid_by, b.notes || ""]
    );
    logAudit(user, "CREATE", "vendor_payment", Number(result.lastInsertRowid), formatINR(b.amount));
    redirect(ctx.res, "/payments");
  });
}
