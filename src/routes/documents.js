import { all, get, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page, badge, icon, emptyState } from "../lib/render.js";
import { escapeHtml, formatDate } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";
import { canWrite, DOCUMENT_TYPES } from "../lib/constants.js";

function linkedLabel(doc) {
  if (!doc.linked_type || !doc.linked_id) return "—";
  const tables = { vendor: "vendors", guest: "guests", payment: "vendor_payments", function: "functions" };
  const table = tables[doc.linked_type];
  if (!table) return doc.linked_type;
  const row = get(`SELECT * FROM ${table} WHERE id = ?`, [doc.linked_id]);
  if (!row) return doc.linked_type;
  const name = row.name || row.full_name || row.description || `#${doc.linked_id}`;
  const hrefMap = { vendor: `/vendors/${doc.linked_id}`, guest: `/guests/${doc.linked_id}`, function: `/functions/${doc.linked_id}` };
  return hrefMap[doc.linked_type] ? `<a href="${hrefMap[doc.linked_type]}">${escapeHtml(name)}</a>` : escapeHtml(name);
}

export function registerDocumentRoutes(router) {
  router.get("/documents", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "documents");
    const { doc_type, linked_type } = ctx.query;

    let sql = "SELECT * FROM documents WHERE 1=1";
    const params = [];
    if (doc_type) { sql += " AND doc_type = ?"; params.push(doc_type); }
    if (linked_type) { sql += " AND linked_type = ?"; params.push(linked_type); }
    sql += " ORDER BY created_at DESC";
    const docs = all(sql, params);

    const vendors = all("SELECT * FROM vendors ORDER BY name");

    const rows = docs
      .map(
        (d) => `<tr>
        <td>${badge(d.doc_type, "gold")}</td>
        <td>${escapeHtml(d.name)}</td>
        <td>${d.linked_type ? badge(d.linked_type, "neutral") : "—"}</td>
        <td>${linkedLabel(d)}</td>
        <td>${d.external_link ? `<a href="${escapeHtml(d.external_link)}" target="_blank" rel="noopener">Open ↗</a>` : "—"}</td>
        <td class="small muted">${formatDate(d.created_at)}</td>
        <td>${canEdit ? `<form method="POST" action="/documents/${d.id}/delete"><button class="btn btn-danger btn-sm">Delete</button></form>` : ""}</td>
      </tr>`
      )
      .join("");

    const content = `
      <div class="page-head">
        <div><h1>Documents</h1><p class="lede">Quotations, contracts, invoices and receipts, all linked back to what they belong to.</p></div>
      </div>
      ${canEdit ? `<div class="card">
        <h2>Add a document record</h2>
        <p class="small muted">No file storage here by design — paste an external link (Google Drive, Dropbox, etc.) so this deploys anywhere without extra setup.</p>
        <form method="POST" action="/documents" class="field-row" style="align-items:end;">
          <div class="field"><label>Type</label><select name="doc_type">${DOCUMENT_TYPES.map((t) => `<option>${t}</option>`).join("")}</select></div>
          <div class="field"><label>Name *</label><input type="text" name="name" required /></div>
          <div class="field"><label>Linked to</label><select name="linked_type"><option value="">— none —</option><option value="vendor">Vendor</option><option value="guest">Guest</option><option value="function">Function</option></select></div>
          <div class="field"><label>Vendor (if applicable)</label><select name="linked_id"><option value="">—</option>${vendors.map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("")}</select></div>
          <div class="field" style="flex:2;"><label>Link</label><input type="url" name="external_link" placeholder="https://..." /></div>
          <div class="field"><button class="btn">${icon("plus")}Add</button></div>
        </form>
      </div>` : ""}
      <div class="card">
        <div class="filter-bar">
          <a href="/documents" class="btn btn-secondary btn-sm">All</a>
          ${DOCUMENT_TYPES.map((t) => `<a href="/documents?doc_type=${encodeURIComponent(t)}" class="btn btn-secondary btn-sm">${t}</a>`).join("")}
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Type</th><th>Name</th><th>Linked</th><th>Belongs to</th><th>Link</th><th>Added</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7">${emptyState("No documents recorded yet.")}</td></tr>`}</tbody></table>
        </div>
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "documents", title: "Documents", content }));
  });

  router.post("/documents", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "documents", "/documents")) return;
    const b = ctx.body;
    const result = run(
      `INSERT INTO documents (doc_type, linked_type, linked_id, name, external_link, notes) VALUES (?,?,?,?,?,?)`,
      [b.doc_type || "Other", b.linked_type || null, b.linked_id || null, b.name, b.external_link, b.notes || ""]
    );
    logAudit(user, "CREATE", "document", Number(result.lastInsertRowid), b.name);
    redirect(ctx.res, b.return_to || "/documents");
  });

  router.post("/documents/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "documents", "/documents")) return;
    run("DELETE FROM documents WHERE id = ?", [ctx.params.id]);
    logAudit(user, "DELETE", "document", Number(ctx.params.id), "");
    redirect(ctx.res, ctx.body.return_to || "/documents");
  });
}
