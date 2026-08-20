import { all, get, run } from "../lib/db.js";
import { requireUser } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page, badge, emptyState } from "../lib/render.js";
import { escapeHtml, maskAadhaar, formatDateTime } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";

const KYC_VIEW_ROLES = ["SUPER_ADMIN", "GUEST_MANAGER"];

function kycVariant(status) {
  if (status === "Verified") return "good";
  if (status === "Submitted") return "gold";
  if (status === "Rejected") return "critical";
  return "warning";
}

export function registerKycRoutes(router) {
  router.get("/kyc", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!KYC_VIEW_ROLES.includes(user.role)) {
      return sendHtml(
        ctx.res,
        page({
          user,
          active: "kyc",
          title: "Aadhaar / KYC",
          content: `<div class="page-head"><h1>Aadhaar / KYC</h1></div><div class="card">${emptyState("This section is restricted to Super Admin and Guest Manager roles to protect sensitive identity documents.")}</div>`,
        })
      );
    }

    const filter = ctx.query.status || "";
    let sql = "SELECT * FROM guests WHERE status != 'Not Coming'";
    const params = [];
    if (filter) { sql += " AND kyc_status = ?"; params.push(filter); }
    sql += " ORDER BY CASE kyc_status WHEN 'Submitted' THEN 0 WHEN 'Pending' THEN 1 WHEN 'Rejected' THEN 2 ELSE 3 END, full_name";
    const guests = all(sql, params);

    const counts = {
      Pending: get("SELECT COUNT(*) c FROM guests WHERE kyc_status='Pending' AND status != 'Not Coming'").c,
      Submitted: get("SELECT COUNT(*) c FROM guests WHERE kyc_status='Submitted' AND status != 'Not Coming'").c,
      Verified: get("SELECT COUNT(*) c FROM guests WHERE kyc_status='Verified' AND status != 'Not Coming'").c,
      Rejected: get("SELECT COUNT(*) c FROM guests WHERE kyc_status='Rejected' AND status != 'Not Coming'").c,
    };

    const rows = guests
      .map(
        (g) => `<tr>
        <td><a href="/guests/${g.id}">${escapeHtml(g.full_name)}</a></td>
        <td>${escapeHtml(g.mobile || "—")}</td>
        <td>${maskAadhaar(g.aadhaar_number)}</td>
        <td>${g.aadhaar_dob || "—"}</td>
        <td>${g.kyc_submitted_at ? formatDateTime(g.kyc_submitted_at) : "—"}</td>
        <td>${badge(g.kyc_status, kycVariant(g.kyc_status))}</td>
        <td>
          <form method="POST" action="/kyc/${g.id}" style="display:flex;gap:6px;">
            <select name="kyc_status">
              <option ${g.kyc_status === "Pending" ? "selected" : ""}>Pending</option>
              <option ${g.kyc_status === "Submitted" ? "selected" : ""}>Submitted</option>
              <option ${g.kyc_status === "Verified" ? "selected" : ""}>Verified</option>
              <option ${g.kyc_status === "Rejected" ? "selected" : ""}>Rejected</option>
            </select>
            <button class="btn btn-secondary btn-sm">Update</button>
          </form>
        </td>
      </tr>`
      )
      .join("");

    const content = `
      <div class="page-head">
        <div><h1>Aadhaar / KYC</h1><p class="lede">Aadhaar numbers are always shown masked. Review and verify guest identity submissions.</p></div>
      </div>
      <div class="stat-grid">
        <div class="stat-tile accent-warning"><div class="stat-label">Pending</div><div class="stat-value">${counts.Pending}</div></div>
        <div class="stat-tile accent-gold"><div class="stat-label">Submitted</div><div class="stat-value">${counts.Submitted}</div></div>
        <div class="stat-tile accent-good"><div class="stat-label">Verified</div><div class="stat-value">${counts.Verified}</div></div>
        <div class="stat-tile accent-critical"><div class="stat-label">Rejected</div><div class="stat-value">${counts.Rejected}</div></div>
      </div>
      <div class="card">
        <div class="filter-bar">
          <a href="/kyc" class="btn btn-secondary btn-sm">All</a>
          <a href="/kyc?status=Submitted" class="btn btn-secondary btn-sm">Submitted</a>
          <a href="/kyc?status=Pending" class="btn btn-secondary btn-sm">Pending</a>
          <a href="/kyc?status=Verified" class="btn btn-secondary btn-sm">Verified</a>
          <a href="/kyc?status=Rejected" class="btn btn-secondary btn-sm">Rejected</a>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Guest</th><th>Mobile</th><th>Aadhaar</th><th>DOB</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7">${emptyState("No guests to review.")}</td></tr>`}</tbody></table>
        </div>
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "kyc", title: "Aadhaar / KYC", content }));
  });

  router.post("/kyc/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!KYC_VIEW_ROLES.includes(user.role)) return redirect(ctx.res, "/kyc");
    run("UPDATE guests SET kyc_status = ?, kyc_reviewed_by = ? WHERE id = ?", [ctx.body.kyc_status, user.id, ctx.params.id]);
    logAudit(user, "KYC_REVIEW", "guest", Number(ctx.params.id), ctx.body.kyc_status);
    redirect(ctx.res, "/kyc");
  });
}
