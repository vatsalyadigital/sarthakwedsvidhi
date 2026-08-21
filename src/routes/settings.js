import { all, get, run } from "../lib/db.js";
import { requireUser } from "../lib/guard.js";
import { sendHtml, sendJsonFile, redirect } from "../lib/router.js";
import { page, badge, emptyState } from "../lib/render.js";
import { escapeHtml, formatDateTime } from "../lib/format.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { ROLES, ROLE_LABELS } from "../lib/constants.js";
import { exportAllData, importAllData } from "../lib/backup.js";

export function registerSettingsRoutes(router) {
  router.get("/settings", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const isSuperAdmin = user.role === "SUPER_ADMIN";

    let usersSection = "";
    let auditSection = "";
    if (isSuperAdmin) {
      const users = all("SELECT * FROM users ORDER BY name");
      usersSection = `
        <div class="card">
          <h2>Team &amp; roles</h2>
          <div class="table-wrap">
            <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
            <tbody>
              ${users
                .map(
                  (u) => `<tr>
                <td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td>
                <td><form method="POST" action="/settings/users/${u.id}/role" style="display:flex;gap:6px;">
                  <select name="role">${ROLES.map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}</select>
                  <button class="btn btn-secondary btn-sm">Save</button>
                </form></td>
                <td>${u.id !== user.id ? `<form method="POST" action="/settings/users/${u.id}/delete" data-confirm="Remove this user?"><button class="btn btn-danger btn-sm">Remove</button></form>` : `<span class="small muted">You</span>`}</td>
              </tr>`
                )
                .join("")}
            </tbody></table>
          </div>
        </div>
        <div class="card">
          <h2>Add team member</h2>
          <form method="POST" action="/settings/users" class="field-row" style="align-items:end;">
            <div class="field"><label>Name</label><input type="text" name="name" required /></div>
            <div class="field"><label>Email</label><input type="email" name="email" required /></div>
            <div class="field"><label>Password</label><input type="password" name="password" required /></div>
            <div class="field"><label>Role</label><select name="role">${ROLES.map((r) => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join("")}</select></div>
            <div class="field"><button class="btn">Add user</button></div>
          </form>
        </div>
      `;

      const importError = ctx.query.importerror;
      const imported = ctx.query.imported;
      usersSection += `
        <div class="card">
          <h2>Backup &amp; restore</h2>
          <p class="small secondary-text">This deployment runs without persistent storage, so data can be lost on redeploy or restart. Download a backup before making infrastructure changes, and restore it after.</p>
          ${importError ? `<div class="flash error" style="margin:0 0 12px;">Restore failed: ${escapeHtml(importError)}</div>` : ""}
          ${imported ? `<div class="flash" style="margin:0 0 12px;">Backup restored successfully.</div>` : ""}
          <div class="field-row" style="align-items:end;">
            <div class="field"><a href="/settings/export" class="btn btn-secondary">Download backup (JSON)</a></div>
          </div>
          <form id="import-form" method="POST" action="/settings/import" class="field-row" style="align-items:end;margin-top:12px;" data-confirm="This will replace ALL current data with the uploaded backup. Continue?">
            <div class="field">
              <label>Restore from backup file</label>
              <input type="file" id="import-file" accept="application/json" />
            </div>
            <input type="hidden" name="data" id="import-data" />
            <div class="field"><button type="submit" class="btn btn-danger btn-sm" id="import-submit" disabled>Restore</button></div>
          </form>
        </div>
      `;

      const logs = all("SELECT al.*, u.name as user_name FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id ORDER BY al.created_at DESC LIMIT 50");
      auditSection = `
        <div class="card">
          <h2>Audit log <span class="small muted">(latest 50)</span></h2>
          ${logs.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>${logs.map((l) => `<tr><td class="small">${formatDateTime(l.created_at)}</td><td>${escapeHtml(l.user_name || "system")}</td><td>${badge(l.action, "neutral")}</td><td class="small">${escapeHtml(l.entity_type || "")}${l.entity_id ? " #" + l.entity_id : ""}</td><td class="small">${escapeHtml(l.details || "")}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No activity yet.")}
        </div>
      `;
    }

    const pwError = ctx.query.pwerror;
    const content = `
      <div class="page-head"><div><h1>Settings</h1><p class="lede">Account, team roles, and system activity.</p></div></div>

      <div class="card">
        <h2>My account</h2>
        <div class="kv-list" style="margin-bottom:16px;">
          <div class="kv-row"><span class="kv-label">Name</span><span class="kv-value">${escapeHtml(user.name)}</span></div>
          <div class="kv-row"><span class="kv-label">Email</span><span class="kv-value">${escapeHtml(user.email)}</span></div>
          <div class="kv-row"><span class="kv-label">Role</span><span class="kv-value">${badge(ROLE_LABELS[user.role] || user.role, "gold")}</span></div>
        </div>
        <div class="section-title" style="margin-top:0;">Change password</div>
        ${pwError ? `<div class="flash error" style="margin:0 0 12px;">Current password is incorrect.</div>` : ""}
        <form method="POST" action="/settings/password" class="field-row" style="align-items:end;">
          <div class="field"><label>Current password</label><input type="password" name="current_password" required /></div>
          <div class="field"><label>New password</label><input type="password" name="new_password" required minlength="6" /></div>
          <div class="field"><button class="btn">Update password</button></div>
        </form>
      </div>

      ${usersSection}
      ${auditSection}

      <div class="card">
        <h2>Role permissions</h2>
        <p class="small secondary-text">Roles control what each teammate can create or edit. Everyone with an account can view all modules; write access is scoped as below.</p>
        <div class="kv-list">
          <div class="kv-row"><span class="kv-label">Super Admin</span><span class="kv-value">Full access to everything</span></div>
          <div class="kv-row"><span class="kv-label">Finance</span><span class="kv-value">Expenses, payments, budget, reports</span></div>
          <div class="kv-row"><span class="kv-label">Guest Manager</span><span class="kv-value">Guests, Aadhaar/KYC, rooms</span></div>
          <div class="kv-row"><span class="kv-label">Vendor Manager</span><span class="kv-value">Vendors, contracts, payments</span></div>
          <div class="kv-row"><span class="kv-label">Viewer</span><span class="kv-value">Read-only across all modules</span></div>
        </div>
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "settings", title: "Settings", content }));
  });

  router.get("/settings/export", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (user.role !== "SUPER_ADMIN") return redirect(ctx.res, "/settings");
    const data = exportAllData();
    const stamp = new Date().toISOString().slice(0, 10);
    logAudit(user, "EXPORT_BACKUP", "system", null, "");
    sendJsonFile(ctx.res, `wedding-erp-backup-${stamp}.json`, data);
  });

  router.post("/settings/import", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (user.role !== "SUPER_ADMIN") return redirect(ctx.res, "/settings");
    try {
      const payload = JSON.parse(ctx.body.data || "");
      importAllData(payload);
      logAudit(user, "IMPORT_BACKUP", "system", null, `Restored ${Object.keys(payload.tables || {}).length} tables`);
      redirect(ctx.res, "/settings?imported=1");
    } catch (err) {
      redirect(ctx.res, "/settings?importerror=" + encodeURIComponent(err.message));
    }
  });

  router.post("/settings/password", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const full = get("SELECT * FROM users WHERE id = ?", [user.id]);
    if (!verifyPassword(ctx.body.current_password || "", full.password_hash)) {
      return redirect(ctx.res, "/settings?pwerror=1");
    }
    run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(ctx.body.new_password), user.id]);
    logAudit(user, "CHANGE_PASSWORD", "user", user.id, "");
    redirect(ctx.res, "/settings");
  });

  router.post("/settings/users", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (user.role !== "SUPER_ADMIN") return redirect(ctx.res, "/settings");
    const b = ctx.body;
    try {
      const result = run("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)", [
        b.name, String(b.email).toLowerCase().trim(), hashPassword(b.password), b.role,
      ]);
      logAudit(user, "CREATE", "user", Number(result.lastInsertRowid), b.email);
    } catch (err) {
      // likely duplicate email — ignore silently, could add flash messaging later
    }
    redirect(ctx.res, "/settings");
  });

  router.post("/settings/users/:id/role", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (user.role !== "SUPER_ADMIN") return redirect(ctx.res, "/settings");
    run("UPDATE users SET role = ? WHERE id = ?", [ctx.body.role, ctx.params.id]);
    logAudit(user, "UPDATE_ROLE", "user", Number(ctx.params.id), ctx.body.role);
    redirect(ctx.res, "/settings");
  });

  router.post("/settings/users/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (user.role !== "SUPER_ADMIN" || Number(ctx.params.id) === user.id) return redirect(ctx.res, "/settings");
    run("DELETE FROM users WHERE id = ?", [ctx.params.id]);
    logAudit(user, "DELETE", "user", Number(ctx.params.id), "");
    redirect(ctx.res, "/settings");
  });
}
