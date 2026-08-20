import { all, get, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page, badge, tabs, icon, emptyState } from "../lib/render.js";
import { escapeHtml, formatINR, formatDate, formatDateTime } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";
import { canWrite, VENDOR_CATEGORIES, PAYMENT_MODES, DOCUMENT_TYPES } from "../lib/constants.js";
import { vendorSummary, vendorFinalContractAmount, quoteItemTotal, quoteTotal } from "../lib/calc.js";

function statusBadge(status) {
  const map = { "Fully Paid": "good", "Partially Paid": "warning", Unpaid: "critical", Overpaid: "gold" };
  return badge(status, map[status] || "neutral");
}

function vendorQuickForm(v = {}, functions = [], selectedFunctionIds = []) {
  return `
    <div class="field-row">
      <div class="field"><label>Vendor / business name *</label><input type="text" name="name" required value="${escapeHtml(v.name || "")}" /></div>
      <div class="field"><label>Category *</label><select name="category">${VENDOR_CATEGORIES.map((c) => `<option value="${c}" ${v.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Contact person</label><input type="text" name="contact_person" value="${escapeHtml(v.contact_person || "")}" /></div>
      <div class="field"><label>Phone</label><input type="tel" name="phone" value="${escapeHtml(v.phone || "")}" /></div>
      <div class="field"><label>WhatsApp</label><input type="tel" name="whatsapp" value="${escapeHtml(v.whatsapp || "")}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Email</label><input type="email" name="email" value="${escapeHtml(v.email || "")}" /></div>
      <div class="field"><label>GST number</label><input type="text" name="gst_number" value="${escapeHtml(v.gst_number || "")}" /></div>
      <div class="field"><label>PAN</label><input type="text" name="pan_number" value="${escapeHtml(v.pan_number || "")}" /></div>
    </div>
    <div class="field"><label>Address</label><input type="text" name="address" value="${escapeHtml(v.address || "")}" /></div>
    <div class="field"><label>Bank details</label><input type="text" name="bank_details" value="${escapeHtml(v.bank_details || "")}" placeholder="Account no · IFSC · Bank name" /></div>
    <div class="field-row">
      <div class="field"><label>Contract value (₹)</label><input type="number" name="contract_value" value="${v.contract_value || 0}" /></div>
      <div class="field"><label>Payment terms</label><input type="text" name="payment_terms" value="${escapeHtml(v.payment_terms || "")}" placeholder="e.g. 50% advance, balance on event day" /></div>
    </div>
    ${functions.length ? `<div class="field"><label>Function(s)</label>
      <div class="pill-row">${functions
        .map((f) => `<label class="checkbox-row" style="border:1px solid var(--border-strong);padding:6px 10px;border-radius:999px;"><input type="checkbox" name="function_ids" value="${f.id}" ${selectedFunctionIds.includes(String(f.id)) ? "checked" : ""}/> ${escapeHtml(f.name)}</label>`)
        .join("")}</div></div>` : ""}
    <div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(v.notes || "")}</textarea></div>
  `;
}

export function registerVendorRoutes(router) {
  // ---------------------------------------------------------------- List
  router.get("/vendors", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "vendors");
    const q = (ctx.query.q || "").trim();
    const categoryFilter = ctx.query.category || "";

    let sql = "SELECT * FROM vendors WHERE 1=1";
    const params = [];
    if (q) {
      sql += " AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ?)";
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (categoryFilter) {
      sql += " AND category = ?";
      params.push(categoryFilter);
    }
    sql += " ORDER BY name";
    const vendors = all(sql, params);

    const rows = vendors
      .map((v) => {
        const s = vendorSummary(v);
        return `<tr class="row-link" onclick="location.href='/vendors/${v.id}'">
          <td><strong>${escapeHtml(v.name)}</strong><div class="small muted">${escapeHtml(v.contact_person || "")}</div></td>
          <td>${badge(v.category, "neutral")}</td>
          <td>${escapeHtml(v.phone || "—")}</td>
          <td class="num">${formatINR(s.finalAmount)}</td>
          <td class="num">${formatINR(s.totalPaid)}</td>
          <td class="num">${formatINR(s.outstanding)}</td>
          <td>${statusBadge(s.status)}</td>
        </tr>`;
      })
      .join("");

    const content = `
      <div class="page-head">
        <div><h1>Vendors</h1><p class="lede">Every wedding vendor, contract, and payment in one place.</p></div>
      </div>
      ${canEdit ? `<a href="/vendors/new" class="big-add-btn" style="margin-bottom:18px;">${icon("plus")}Add Vendor</a>` : ""}
      <div class="card">
        <form class="filter-bar" method="GET" action="/vendors">
          <input type="text" name="q" placeholder="Search vendor, contact, phone..." value="${escapeHtml(q)}" />
          <select name="category" onchange="this.form.submit()">
            <option value="">All categories</option>
            ${VENDOR_CATEGORIES.map((c) => `<option value="${c}" ${categoryFilter === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
          <button class="btn btn-secondary btn-sm">Filter</button>
        </form>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Vendor</th><th>Category</th><th>Phone</th><th class="num">Contract</th><th class="num">Paid</th><th class="num">Outstanding</th><th>Status</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="7">${emptyState("No vendors match — add one to get started.")}</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "vendors", title: "Vendors", content }));
  });

  // ---------------------------------------------------------------- New / Create
  router.get("/vendors/new", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    const functions = all("SELECT * FROM functions ORDER BY date");
    const content = `
      <div class="page-head"><h1>Add Vendor</h1><p class="lede">Adding a vendor automatically creates their dedicated dashboard.</p></div>
      <div class="card"><form method="POST" action="/vendors">${vendorQuickForm({}, functions, [])}<button type="submit" class="btn btn-lg">Save vendor</button></form></div>
    `;
    sendHtml(ctx.res, page({ user, active: "vendors", title: "Add Vendor", content }));
  });

  router.post("/vendors", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    const b = ctx.body;
    const result = run(
      `INSERT INTO vendors (name, category, contact_person, phone, whatsapp, email, address, gst_number, pan_number, bank_details, payment_terms, notes, contract_value)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.name, b.category || "Other", b.contact_person, b.phone, b.whatsapp, b.email, b.address, b.gst_number, b.pan_number, b.bank_details, b.payment_terms, b.notes, Number(b.contract_value) || 0]
    );
    const vendorId = Number(result.lastInsertRowid);
    const functionIds = Array.isArray(b.function_ids) ? b.function_ids : b.function_ids ? [b.function_ids] : [];
    for (const fid of functionIds) run(`INSERT OR IGNORE INTO vendor_functions (vendor_id, function_id) VALUES (?, ?)`, [vendorId, fid]);
    logAudit(user, "CREATE", "vendor", vendorId, b.name);
    redirect(ctx.res, `/vendors/${vendorId}`);
  });

  // ---------------------------------------------------------------- Edit / Update / Delete
  router.get("/vendors/:id/edit", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    const v = get("SELECT * FROM vendors WHERE id = ?", [ctx.params.id]);
    if (!v) return redirect(ctx.res, "/vendors");
    const functions = all("SELECT * FROM functions ORDER BY date");
    const selected = all("SELECT function_id FROM vendor_functions WHERE vendor_id = ?", [v.id]).map((r) => String(r.function_id));
    const content = `
      <div class="page-head"><h1>Edit ${escapeHtml(v.name)}</h1></div>
      <div class="card"><form method="POST" action="/vendors/${v.id}">${vendorQuickForm(v, functions, selected)}<button type="submit" class="btn btn-lg">Save changes</button></form></div>
    `;
    sendHtml(ctx.res, page({ user, active: "vendors", title: "Edit Vendor", content }));
  });

  router.post("/vendors/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    const b = ctx.body;
    run(
      `UPDATE vendors SET name=?, category=?, contact_person=?, phone=?, whatsapp=?, email=?, address=?, gst_number=?, pan_number=?, bank_details=?, payment_terms=?, notes=?, contract_value=? WHERE id=?`,
      [b.name, b.category || "Other", b.contact_person, b.phone, b.whatsapp, b.email, b.address, b.gst_number, b.pan_number, b.bank_details, b.payment_terms, b.notes, Number(b.contract_value) || 0, ctx.params.id]
    );
    run(`DELETE FROM vendor_functions WHERE vendor_id = ?`, [ctx.params.id]);
    const functionIds = Array.isArray(b.function_ids) ? b.function_ids : b.function_ids ? [b.function_ids] : [];
    for (const fid of functionIds) run(`INSERT OR IGNORE INTO vendor_functions (vendor_id, function_id) VALUES (?, ?)`, [ctx.params.id, fid]);
    logAudit(user, "UPDATE", "vendor", Number(ctx.params.id), b.name);
    redirect(ctx.res, `/vendors/${ctx.params.id}`);
  });

  router.post("/vendors/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    run(`DELETE FROM vendors WHERE id = ?`, [ctx.params.id]);
    logAudit(user, "DELETE", "vendor", Number(ctx.params.id), "");
    redirect(ctx.res, "/vendors");
  });

  // ---------------------------------------------------------------- Contract tab update
  router.post("/vendors/:id/contract", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    const b = ctx.body;
    run(
      `UPDATE vendors SET contract_value=?, discount_amount=?, tax_percent=?, contract_status=?, contract_signed_date=?, next_payment_due_date=?, next_payment_amount=? WHERE id=?`,
      [Number(b.contract_value) || 0, Number(b.discount_amount) || 0, Number(b.tax_percent) || 0, b.contract_status, b.contract_signed_date, b.next_payment_due_date, Number(b.next_payment_amount) || 0, ctx.params.id]
    );
    logAudit(user, "UPDATE", "vendor_contract", Number(ctx.params.id), "");
    redirect(ctx.res, `/vendors/${ctx.params.id}?tab=contract`);
  });

  // ---------------------------------------------------------------- Notes quick update
  router.post("/vendors/:id/notes", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    run(`UPDATE vendors SET notes=? WHERE id=?`, [ctx.body.notes, ctx.params.id]);
    redirect(ctx.res, `/vendors/${ctx.params.id}?tab=notes`);
  });

  // ---------------------------------------------------------------- Quotes
  router.post("/vendors/:id/quotes", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    const b = ctx.body;
    const result = run(`INSERT INTO vendor_quotes (vendor_id, quote_number, quote_date, notes) VALUES (?,?,?,?)`, [ctx.params.id, b.quote_number, b.quote_date, b.notes]);
    logAudit(user, "CREATE", "vendor_quote", Number(result.lastInsertRowid), "");
    redirect(ctx.res, `/vendors/${ctx.params.id}?tab=quotation`);
  });

  router.post("/vendors/:id/quotes/:quoteId/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    run(`DELETE FROM vendor_quotes WHERE id = ?`, [ctx.params.quoteId]);
    redirect(ctx.res, `/vendors/${ctx.params.id}?tab=quotation`);
  });

  router.post("/vendors/:id/quotes/:quoteId/items", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    const b = ctx.body;
    run(
      `INSERT INTO vendor_quote_items (quote_id, description, quantity, rate, discount, tax_percent) VALUES (?,?,?,?,?,?)`,
      [ctx.params.quoteId, b.description, Number(b.quantity) || 1, Number(b.rate) || 0, Number(b.discount) || 0, Number(b.tax_percent) || 0]
    );
    redirect(ctx.res, `/vendors/${ctx.params.id}?tab=quotation`);
  });

  router.post("/vendors/:id/quotes/:quoteId/items/:itemId/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "vendors", "/vendors")) return;
    run(`DELETE FROM vendor_quote_items WHERE id = ?`, [ctx.params.itemId]);
    redirect(ctx.res, `/vendors/${ctx.params.id}?tab=quotation`);
  });

  // ---------------------------------------------------------------- Payments
  router.post("/vendors/:id/payments", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "payments", "/vendors")) return;
    const b = ctx.body;
    const result = run(
      `INSERT INTO vendor_payments (vendor_id, payment_date, amount, mode, transaction_ref, paid_by, notes) VALUES (?,?,?,?,?,?,?)`,
      [ctx.params.id, b.payment_date, Number(b.amount) || 0, b.mode, b.transaction_ref, b.paid_by, b.notes]
    );
    logAudit(user, "CREATE", "vendor_payment", Number(result.lastInsertRowid), formatINR(b.amount));
    redirect(ctx.res, `/vendors/${ctx.params.id}?tab=payments`);
  });

  router.post("/vendors/:id/payments/:paymentId/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "payments", "/vendors")) return;
    run(`DELETE FROM vendor_payments WHERE id = ?`, [ctx.params.paymentId]);
    redirect(ctx.res, `/vendors/${ctx.params.id}?tab=payments`);
  });

  // ---------------------------------------------------------------- Detail (tabs)
  router.get("/vendors/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const v = get("SELECT * FROM vendors WHERE id = ?", [ctx.params.id]);
    if (!v) return redirect(ctx.res, "/vendors");
    const canEdit = canWrite(user.role, "vendors");
    const activeTab = ctx.query.tab || "overview";
    const s = vendorSummary(v);

    const tabItems = [
      { key: "overview", label: "Overview", href: `/vendors/${v.id}?tab=overview` },
      { key: "quotation", label: "Quotation", href: `/vendors/${v.id}?tab=quotation` },
      { key: "contract", label: "Contract", href: `/vendors/${v.id}?tab=contract` },
      { key: "expenses", label: "Expenses", href: `/vendors/${v.id}?tab=expenses` },
      { key: "payments", label: "Payments", href: `/vendors/${v.id}?tab=payments` },
      { key: "documents", label: "Documents", href: `/vendors/${v.id}?tab=documents` },
      { key: "notes", label: "Notes", href: `/vendors/${v.id}?tab=notes` },
    ];

    let tabContent = "";

    if (activeTab === "overview") {
      const relatedFunctions = all(`SELECT f.* FROM functions f JOIN vendor_functions vf ON vf.function_id=f.id WHERE vf.vendor_id=?`, [v.id]);
      tabContent = `
        <div class="stat-grid">
          <div class="stat-tile"><div class="stat-label">Total Contract Value</div><div class="stat-value">${formatINR(s.finalAmount)}</div></div>
          <div class="stat-tile accent-good"><div class="stat-label">Amount Paid</div><div class="stat-value">${formatINR(s.totalPaid)}</div></div>
          <div class="stat-tile accent-${s.outstanding > 0 ? "warning" : "good"}"><div class="stat-label">Amount Outstanding</div><div class="stat-value">${formatINR(s.outstanding)}</div></div>
          <div class="stat-tile"><div class="stat-label">Payment Status</div><div class="stat-value" style="font-size:16px;">${statusBadge(s.status)}</div></div>
        </div>
        <div class="grid grid-2">
          <div class="card">
            <h2>Contact</h2>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-label">Contact person</span><span class="kv-value">${escapeHtml(v.contact_person || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">Phone</span><span class="kv-value">${escapeHtml(v.phone || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">WhatsApp</span><span class="kv-value">${escapeHtml(v.whatsapp || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">Email</span><span class="kv-value">${escapeHtml(v.email || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">GST</span><span class="kv-value">${escapeHtml(v.gst_number || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">PAN</span><span class="kv-value">${escapeHtml(v.pan_number || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">Address</span><span class="kv-value">${escapeHtml(v.address || "—")}</span></div>
            </div>
          </div>
          <div class="card">
            <h2>Next payment &amp; related functions</h2>
            <div class="kv-list" style="margin-bottom:16px;">
              <div class="kv-row"><span class="kv-label">Next payment due</span><span class="kv-value">${v.next_payment_due_date ? formatDate(v.next_payment_due_date) : "—"}</span></div>
              <div class="kv-row"><span class="kv-label">Next payment amount</span><span class="kv-value">${formatINR(v.next_payment_amount)}</span></div>
            </div>
            <div class="section-title" style="margin-top:0;">Functions</div>
            ${relatedFunctions.length ? `<div class="pill-row">${relatedFunctions.map((f) => `<a href="/functions/${f.id}" class="badge badge-neutral">${escapeHtml(f.name)}</a>`).join("")}</div>` : emptyState("No functions linked yet — edit the vendor to link one.")}
          </div>
        </div>
      `;
    }

    if (activeTab === "quotation") {
      const quotes = all(`SELECT * FROM vendor_quotes WHERE vendor_id = ? ORDER BY quote_date DESC`, [v.id]);
      tabContent = `
        ${canEdit ? `<div class="card">
          <h2>New quotation</h2>
          <form method="POST" action="/vendors/${v.id}/quotes" class="field-row" style="align-items:end;">
            <div class="field"><label>Quotation number</label><input type="text" name="quote_number" /></div>
            <div class="field"><label>Quotation date</label><input type="date" name="quote_date" /></div>
            <div class="field"><label>Notes</label><input type="text" name="notes" /></div>
            <div class="field"><button class="btn">Create</button></div>
          </form>
        </div>` : ""}
        ${quotes
          .map((q) => {
            const items = all(`SELECT * FROM vendor_quote_items WHERE quote_id = ?`, [q.id]);
            const total = quoteTotal(items);
            return `<div class="card">
              <div class="card-row">
                <h2 style="margin:0;">${escapeHtml(q.quote_number || "Quotation #" + q.id)} <span class="small muted">${q.quote_date ? formatDate(q.quote_date) : ""}</span></h2>
                ${canEdit ? `<form method="POST" action="/vendors/${v.id}/quotes/${q.id}/delete" data-confirm="Delete this quotation?"><button class="btn btn-danger btn-sm">Delete quote</button></form>` : ""}
              </div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Discount</th><th class="num">Tax %</th><th class="num">Total</th><th></th></tr></thead>
                  <tbody>
                    ${items
                      .map(
                        (i) => `<tr><td>${escapeHtml(i.description)}</td><td class="num">${i.quantity}</td><td class="num">${formatINR(i.rate)}</td><td class="num">${formatINR(i.discount)}</td><td class="num">${i.tax_percent}%</td><td class="num">${formatINR(quoteItemTotal(i))}</td>
                        <td>${canEdit ? `<form method="POST" action="/vendors/${v.id}/quotes/${q.id}/items/${i.id}/delete"><button class="btn-sm btn-secondary btn" style="padding:3px 8px;">✕</button></form>` : ""}</td></tr>`
                      )
                      .join("") || `<tr><td colspan="7">${emptyState("No items yet.")}</td></tr>`}
                  </tbody>
                  <tfoot><tr><td colspan="5" style="text-align:right;font-weight:700;">Quotation total</td><td class="num" style="font-weight:700;">${formatINR(total)}</td><td></td></tr></tfoot>
                </table>
              </div>
              ${canEdit ? `<form method="POST" action="/vendors/${v.id}/quotes/${q.id}/items" class="field-row" style="align-items:end;margin-top:14px;">
                <div class="field"><label>Description</label><input type="text" name="description" required /></div>
                <div class="field"><label>Qty</label><input type="number" name="quantity" value="1" step="any" /></div>
                <div class="field"><label>Rate (₹)</label><input type="number" name="rate" value="0" /></div>
                <div class="field"><label>Discount (₹)</label><input type="number" name="discount" value="0" /></div>
                <div class="field"><label>Tax %</label><input type="number" name="tax_percent" value="0" /></div>
                <div class="field"><button class="btn btn-secondary">+ Add item</button></div>
              </form>` : ""}
            </div>`;
          })
          .join("") || emptyState("No quotations recorded yet.")}
      `;
    }

    if (activeTab === "contract") {
      const finalAmount = vendorFinalContractAmount(v);
      tabContent = `
        <div class="card">
          <h2>Contract</h2>
          <form method="POST" action="/vendors/${v.id}/contract">
            <div class="field-row">
              <div class="field"><label>Contract value (₹)</label><input type="number" name="contract_value" value="${v.contract_value || 0}" ${canEdit ? "" : "disabled"} /></div>
              <div class="field"><label>Discount (₹)</label><input type="number" name="discount_amount" value="${v.discount_amount || 0}" ${canEdit ? "" : "disabled"} /></div>
              <div class="field"><label>Tax %</label><input type="number" name="tax_percent" value="${v.tax_percent || 0}" ${canEdit ? "" : "disabled"} /></div>
            </div>
            <div class="field-row">
              <div class="field"><label>Contract status</label><select name="contract_status" ${canEdit ? "" : "disabled"}>
                <option ${v.contract_status === "Draft" ? "selected" : ""}>Draft</option>
                <option ${v.contract_status === "Signed" ? "selected" : ""}>Signed</option>
              </select></div>
              <div class="field"><label>Signed date</label><input type="date" name="contract_signed_date" value="${escapeHtml(v.contract_signed_date || "")}" ${canEdit ? "" : "disabled"} /></div>
            </div>
            <div class="field-row">
              <div class="field"><label>Next payment due date</label><input type="date" name="next_payment_due_date" value="${escapeHtml(v.next_payment_due_date || "")}" ${canEdit ? "" : "disabled"} /></div>
              <div class="field"><label>Next payment amount (₹)</label><input type="number" name="next_payment_amount" value="${v.next_payment_amount || 0}" ${canEdit ? "" : "disabled"} /></div>
            </div>
            <div class="card" style="background:var(--surface-alt);box-shadow:none;">
              <div class="kv-list">
                <div class="kv-row"><span class="kv-label">Contract Value</span><span class="kv-value">${formatINR(v.contract_value)}</span></div>
                <div class="kv-row"><span class="kv-label">− Discount</span><span class="kv-value">${formatINR(v.discount_amount)}</span></div>
                <div class="kv-row"><span class="kv-label">+ Tax (${v.tax_percent || 0}%)</span><span class="kv-value">${formatINR(finalAmount - (v.contract_value - v.discount_amount))}</span></div>
                <div class="kv-row" style="border-top:1px solid var(--border-strong);padding-top:8px;"><span class="kv-label"><strong>= Final Contract Amount</strong></span><span class="kv-value">${formatINR(finalAmount)}</span></div>
              </div>
            </div>
            ${canEdit ? `<button type="submit" class="btn" style="margin-top:14px;">Save contract details</button>` : ""}
          </form>
        </div>
      `;
    }

    if (activeTab === "expenses") {
      const expenses = all(`SELECT * FROM expenses WHERE vendor_id = ? ORDER BY date DESC`, [v.id]);
      tabContent = `<div class="card">
        <div class="card-row"><h2 style="margin:0;">Expenses linked to this vendor</h2><a href="/expenses/new?vendor_id=${v.id}" class="btn btn-secondary btn-sm">+ Add expense</a></div>
        ${expenses.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>
          ${expenses.map((e) => `<tr><td>${formatDate(e.date)}</td><td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.description)}</td><td class="num">${formatINR(e.amount + e.tax)}</td><td>${badge(e.payment_status, e.payment_status === "Paid" ? "good" : e.payment_status === "Partially Paid" ? "warning" : "critical")}</td></tr>`).join("")}
        </tbody></table></div>` : emptyState("No expenses linked to this vendor yet.")}
      </div>`;
    }

    if (activeTab === "payments") {
      const payments = all(`SELECT * FROM vendor_payments WHERE vendor_id = ? ORDER BY payment_date DESC`, [v.id]);
      tabContent = `
        ${canEdit ? `<div class="card">
          <h2>Record a payment</h2>
          <form method="POST" action="/vendors/${v.id}/payments" class="field-row" style="align-items:end;">
            <div class="field"><label>Date</label><input type="date" name="payment_date" required /></div>
            <div class="field"><label>Amount (₹)</label><input type="number" name="amount" required /></div>
            <div class="field"><label>Mode</label><select name="mode">${PAYMENT_MODES.map((m) => `<option>${m}</option>`).join("")}</select></div>
            <div class="field"><label>Transaction ID</label><input type="text" name="transaction_ref" /></div>
            <div class="field"><label>Paid by</label><input type="text" name="paid_by" /></div>
            <div class="field" style="flex:2;"><label>Notes</label><input type="text" name="notes" /></div>
            <div class="field"><button class="btn">Add payment</button></div>
          </form>
        </div>` : ""}
        <div class="card">
          <h2>Payment history</h2>
          ${payments.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Amount</th><th>Mode</th><th>Reference</th><th>Paid by</th><th>Notes</th><th></th></tr></thead><tbody>
            ${payments
              .map(
                (p) => `<tr><td>${formatDate(p.payment_date)}</td><td class="num">${formatINR(p.amount)}</td><td>${badge(p.mode, "neutral")}</td><td>${escapeHtml(p.transaction_ref || "—")}</td><td>${escapeHtml(p.paid_by || "—")}</td><td class="small">${escapeHtml(p.notes || "")}</td>
                <td>${canEdit ? `<form method="POST" action="/vendors/${v.id}/payments/${p.id}/delete" data-confirm="Delete this payment?"><button class="btn btn-danger btn-sm">Delete</button></form>` : ""}</td></tr>`
              )
              .join("")}
          </tbody></table></div>` : emptyState("No payments recorded yet.")}
        </div>
      `;
    }

    if (activeTab === "documents") {
      const docs = all(`SELECT * FROM documents WHERE linked_type='vendor' AND linked_id=? ORDER BY created_at DESC`, [v.id]);
      tabContent = `
        ${canEdit ? `<div class="card">
          <h2>Add a document record</h2>
          <p class="small muted">File uploads aren't stored here — paste a link (Google Drive, Dropbox, etc.) instead.</p>
          <form method="POST" action="/documents" class="field-row" style="align-items:end;">
            <input type="hidden" name="linked_type" value="vendor" />
            <input type="hidden" name="linked_id" value="${v.id}" />
            <input type="hidden" name="return_to" value="/vendors/${v.id}?tab=documents" />
            <div class="field"><label>Type</label><select name="doc_type">${DOCUMENT_TYPES.map((t) => `<option>${t}</option>`).join("")}</select></div>
            <div class="field"><label>Name</label><input type="text" name="name" required placeholder="e.g. Signed contract" /></div>
            <div class="field" style="flex:2;"><label>Link</label><input type="url" name="external_link" placeholder="https://drive.google.com/..." /></div>
            <div class="field"><button class="btn">Add</button></div>
          </form>
        </div>` : ""}
        <div class="card">
          <h2>Documents</h2>
          ${docs.length ? `<div class="table-wrap"><table><thead><tr><th>Type</th><th>Name</th><th>Link</th><th>Added</th><th></th></tr></thead><tbody>
            ${docs.map((d) => `<tr><td>${badge(d.doc_type, "gold")}</td><td>${escapeHtml(d.name)}</td><td>${d.external_link ? `<a href="${escapeHtml(d.external_link)}" target="_blank" rel="noopener">Open ↗</a>` : "—"}</td><td class="small muted">${formatDate(d.created_at)}</td>
            <td>${canEdit ? `<form method="POST" action="/documents/${d.id}/delete"><input type="hidden" name="return_to" value="/vendors/${v.id}?tab=documents" /><button class="btn btn-danger btn-sm">Delete</button></form>` : ""}</td></tr>`).join("")}
          </tbody></table></div>` : emptyState("No documents recorded yet.")}
        </div>
      `;
    }

    if (activeTab === "notes") {
      tabContent = `<div class="card"><h2>Notes</h2><form method="POST" action="/vendors/${v.id}/notes">
        <textarea name="notes" rows="8" ${canEdit ? "" : "disabled"}>${escapeHtml(v.notes || "")}</textarea>
        ${canEdit ? `<button class="btn" style="margin-top:10px;">Save notes</button>` : ""}
      </form></div>`;
    }

    const content = `
      <div class="page-head">
        <div><h1>${escapeHtml(v.name)}</h1><p class="lede">${escapeHtml(v.category)} vendor</p></div>
        ${canEdit ? `<div style="display:flex;gap:8px;"><a href="/vendors/${v.id}/edit" class="btn btn-secondary">Edit details</a>
        <form method="POST" action="/vendors/${v.id}/delete" data-confirm="Delete this vendor and all related data?"><button class="btn btn-danger">Delete</button></form></div>` : ""}
      </div>
      ${tabs(tabItems, activeTab)}
      ${tabContent}
    `;
    sendHtml(ctx.res, page({ user, active: "vendors", title: v.name, content }));
  });
}
