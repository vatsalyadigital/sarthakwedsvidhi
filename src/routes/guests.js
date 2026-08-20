import crypto from "node:crypto";
import { all, get, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect, sendCsv, toCsv } from "../lib/router.js";
import { page, badge, icon, emptyState } from "../lib/render.js";
import { escapeHtml, formatDate, maskAadhaar } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";
import { canWrite, GUEST_STATUSES } from "../lib/constants.js";

function newToken() {
  return crypto.randomBytes(16).toString("hex");
}

function statusVariant(status) {
  if (status === "Checked In") return "good";
  if (status === "Confirmed" || status === "Arrived") return "gold";
  if (status === "Not Coming") return "critical";
  return "neutral";
}

function kycVariant(status) {
  if (status === "Verified") return "good";
  if (status === "Submitted") return "gold";
  if (status === "Rejected") return "critical";
  return "warning";
}

function guestForm(g = {}, groups = []) {
  return `
    <div class="field-row">
      <div class="field"><label>Full name *</label><input type="text" name="full_name" required value="${escapeHtml(g.full_name || "")}" /></div>
      <div class="field"><label>Gender</label><select name="gender"><option ${g.gender === "Male" ? "selected" : ""}>Male</option><option ${g.gender === "Female" ? "selected" : ""}>Female</option><option ${g.gender === "Other" ? "selected" : ""}>Other</option></select></div>
      <div class="field"><label>Age</label><input type="number" name="age" value="${g.age || ""}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Mobile</label><input type="tel" name="mobile" value="${escapeHtml(g.mobile || "")}" /></div>
      <div class="field"><label>WhatsApp</label><input type="tel" name="whatsapp" value="${escapeHtml(g.whatsapp || "")}" /></div>
      <div class="field"><label>Email</label><input type="email" name="email" value="${escapeHtml(g.email || "")}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Family / group</label><select name="group_id"><option value="">— none —</option>${groups.map((gr) => `<option value="${gr.id}" ${String(g.group_id) === String(gr.id) ? "selected" : ""}>${escapeHtml(gr.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Relationship</label><input type="text" name="relationship" value="${escapeHtml(g.relationship || "")}" placeholder="e.g. Groom's cousin" /></div>
      <div class="field"><label>Accompanying people</label><input type="number" name="accompanying_count" value="${g.accompanying_count || 0}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Arrival date</label><input type="date" name="arrival_date" value="${escapeHtml(g.arrival_date || "")}" /></div>
      <div class="field"><label>Arrival time</label><input type="time" name="arrival_time" value="${escapeHtml(g.arrival_time || "")}" /></div>
      <div class="field"><label>Departure date</label><input type="date" name="departure_date" value="${escapeHtml(g.departure_date || "")}" /></div>
      <div class="field"><label>Departure time</label><input type="time" name="departure_time" value="${escapeHtml(g.departure_time || "")}" /></div>
    </div>
    <div class="field"><label>Travel details</label><input type="text" name="travel_details" value="${escapeHtml(g.travel_details || "")}" placeholder="Flight / train number, etc." /></div>
    <div class="field-row">
      <div class="field"><label class="checkbox-row"><input type="checkbox" name="room_required" value="1" ${g.room_required || g.id === undefined ? "checked" : ""} /> Room required</label></div>
      <div class="field"><label>Bed requirement</label><input type="text" name="bed_requirement" value="${escapeHtml(g.bed_requirement || "")}" placeholder="e.g. 2 single beds" /></div>
      <div class="field"><label>Food preference</label><input type="text" name="food_preference" value="${escapeHtml(g.food_preference || "")}" placeholder="Veg / Non-veg / Jain..." /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Status</label><select name="status">${GUEST_STATUSES.map((s) => `<option ${g.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Special requirements</label><input type="text" name="special_requirements" value="${escapeHtml(g.special_requirements || "")}" /></div>
    </div>
    <div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(g.notes || "")}</textarea></div>
  `;
}

export function registerGuestRoutes(router) {
  router.get("/guests", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "guests");
    const { status, group_id, q, arrival } = ctx.query;

    let sql = `SELECT g.*, gr.name as group_name FROM guests g LEFT JOIN guest_groups gr ON gr.id = g.group_id WHERE 1=1`;
    const params = [];
    if (status) { sql += " AND g.status = ?"; params.push(status); }
    if (group_id) { sql += " AND g.group_id = ?"; params.push(group_id); }
    if (q) { sql += " AND (g.full_name LIKE ? OR g.mobile LIKE ?)"; params.push(`%${q}%`, `%${q}%`); }
    if (arrival === "tomorrow") {
      const t = new Date(); t.setDate(t.getDate() + 1);
      sql += " AND g.arrival_date = ?"; params.push(t.toISOString().slice(0, 10));
    }
    sql += " ORDER BY g.full_name";
    const guests = all(sql, params);
    const groups = all("SELECT * FROM guest_groups ORDER BY name");

    const rows = guests
      .map((g) => {
        const room = get(
          `SELECT r.room_number, h.name as hotel_name FROM room_allocations ra JOIN rooms r ON r.id = ra.room_id JOIN hotels h ON h.id = r.hotel_id WHERE ra.guest_id = ? AND ra.checked_out_at IS NULL`,
          [g.id]
        );
        return `<tr class="row-link" onclick="location.href='/guests/${g.id}'">
          <td><strong>${escapeHtml(g.full_name)}</strong>${g.relationship ? `<div class="small muted">${escapeHtml(g.relationship)}</div>` : ""}</td>
          <td>${escapeHtml(g.group_name || "—")}</td>
          <td>${escapeHtml(g.mobile || "—")}</td>
          <td>${g.arrival_date ? formatDate(g.arrival_date) : "—"}</td>
          <td>${room ? `${escapeHtml(room.room_number)} <span class="small muted">(${escapeHtml(room.hotel_name)})</span>` : `<span class="muted small">Unallocated</span>`}</td>
          <td>${badge(g.kyc_status, kycVariant(g.kyc_status))}</td>
          <td>${badge(g.status, statusVariant(g.status))}</td>
        </tr>`;
      })
      .join("");

    const content = `
      <div class="page-head">
        <div><h1>Guests</h1><p class="lede">${guests.length} guest${guests.length === 1 ? "" : "s"} in the list.</p></div>
        <div style="display:flex;gap:8px;">
          <a href="/guests/families" class="btn btn-secondary">Families</a>
          <a href="/guests/export.csv" class="btn btn-secondary">Export CSV</a>
          ${canEdit ? `<a href="/guests/import" class="btn btn-secondary">Import CSV</a><a href="/guests/new" class="btn">${icon("plus")}Add Guest</a>` : ""}
        </div>
      </div>
      <div class="card">
        <form class="filter-bar" method="GET" action="/guests">
          <input type="text" name="q" placeholder="Search name or phone..." value="${escapeHtml(q || "")}" />
          <select name="status" onchange="this.form.submit()"><option value="">Any status</option>${GUEST_STATUSES.map((s) => `<option ${status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          <select name="group_id" onchange="this.form.submit()"><option value="">Any family</option>${groups.map((gr) => `<option value="${gr.id}" ${group_id === String(gr.id) ? "selected" : ""}>${escapeHtml(gr.name)}</option>`).join("")}</select>
          <button class="btn btn-secondary btn-sm">Filter</button>
        </form>
        <div class="table-wrap">
          <table><thead><tr><th>Name</th><th>Family</th><th>Mobile</th><th>Arrival</th><th>Room</th><th>KYC</th><th>Status</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7">${emptyState("No guests match — add one to get started.")}</td></tr>`}</tbody></table>
        </div>
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "guests", title: "Guests", content }));
  });

  router.get("/guests/export.csv", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const guests = all(`SELECT g.*, gr.name as group_name FROM guests g LEFT JOIN guest_groups gr ON gr.id=g.group_id ORDER BY g.full_name`);
    const csv = toCsv(guests, [
      { label: "Name", value: "full_name" }, { label: "Family", value: "group_name" },
      { label: "Mobile", value: "mobile" }, { label: "Email", value: "email" },
      { label: "Arrival Date", value: "arrival_date" }, { label: "Departure Date", value: "departure_date" },
      { label: "Status", value: "status" }, { label: "KYC Status", value: "kyc_status" },
      { label: "Accompanying", value: "accompanying_count" }, { label: "Notes", value: "notes" },
    ]);
    sendCsv(ctx.res, "guests.csv", csv);
  });

  router.get("/guests/import", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "guests", "/guests")) return;
    const content = `
      <div class="page-head"><h1>Import Guests</h1><p class="lede">Paste CSV with header: full_name,mobile,email,group_name,relationship,arrival_date,departure_date</p></div>
      <div class="card">
        <form method="POST" action="/guests/import">
          <div class="field"><textarea name="csv" rows="12" placeholder="full_name,mobile,email,group_name,relationship,arrival_date,departure_date
Rohan Sharma,9876543210,rohan@example.com,Sharma Family,Cousin,2026-12-10,2026-12-13"></textarea></div>
          <button class="btn">Import</button>
        </form>
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "guests", title: "Import Guests", content }));
  });

  router.post("/guests/import", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "guests", "/guests")) return;
    const csv = (ctx.body.csv || "").trim();
    if (!csv) return redirect(ctx.res, "/guests/import");
    const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    let created = 0;
    for (const line of lines.slice(1)) {
      const cols = line.split(",");
      const row = Object.fromEntries(header.map((h, i) => [h, (cols[i] || "").trim()]));
      if (!row.full_name) continue;
      let groupId = null;
      if (row.group_name) {
        let group = get("SELECT id FROM guest_groups WHERE name = ?", [row.group_name]);
        if (!group) {
          const r = run("INSERT INTO guest_groups (name) VALUES (?)", [row.group_name]);
          groupId = Number(r.lastInsertRowid);
        } else groupId = group.id;
      }
      run(
        `INSERT INTO guests (full_name, mobile, email, group_id, relationship, arrival_date, departure_date, portal_token) VALUES (?,?,?,?,?,?,?,?)`,
        [row.full_name, row.mobile || "", row.email || "", groupId, row.relationship || "", row.arrival_date || "", row.departure_date || "", newToken()]
      );
      created++;
    }
    logAudit(user, "IMPORT", "guest", null, `${created} guests imported`);
    redirect(ctx.res, "/guests");
  });

  router.get("/guests/families", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "guests");
    const groups = all("SELECT * FROM guest_groups ORDER BY name");
    const rows = groups
      .map((gr) => {
        const members = all("SELECT * FROM guests WHERE group_id = ?", [gr.id]);
        const rooms = all(
          `SELECT DISTINCT r.room_number FROM room_allocations ra JOIN rooms r ON r.id=ra.room_id WHERE ra.guest_id IN (${members.map(() => "?").join(",") || "0"}) AND ra.checked_out_at IS NULL`,
          members.map((m) => m.id)
        );
        const kycDone = members.filter((m) => m.kyc_status === "Verified").length;
        return `<tr>
          <td><a href="/guests?group_id=${gr.id}"><strong>${escapeHtml(gr.name)}</strong></a></td>
          <td>${members.length}</td>
          <td>${rooms.map((r) => escapeHtml(r.room_number)).join(", ") || "—"}</td>
          <td>${kycDone}/${members.length} verified</td>
        </tr>`;
      })
      .join("");
    const content = `
      <div class="page-head"><div><h1>Families</h1><p class="lede">Group guests together for easy room allocation.</p></div></div>
      ${canEdit ? `<div class="card"><h2>Add family</h2><form method="POST" action="/guests/families" class="field-row" style="align-items:end;">
        <div class="field"><label>Family name</label><input type="text" name="name" required /></div>
        <div class="field"><label>Notes</label><input type="text" name="notes" /></div>
        <div class="field"><button class="btn">${icon("plus")}Add</button></div>
      </form></div>` : ""}
      <div class="card"><h2>All families</h2><div class="table-wrap"><table><thead><tr><th>Family</th><th>Members</th><th>Rooms</th><th>KYC</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4">${emptyState("No families yet.")}</td></tr>`}</tbody></table></div></div>
    `;
    sendHtml(ctx.res, page({ user, active: "guests", title: "Families", content }));
  });

  router.post("/guests/families", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "guests", "/guests")) return;
    run("INSERT INTO guest_groups (name, notes) VALUES (?, ?)", [ctx.body.name, ctx.body.notes || ""]);
    redirect(ctx.res, "/guests/families");
  });

  router.get("/guests/new", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "guests", "/guests")) return;
    const groups = all("SELECT * FROM guest_groups ORDER BY name");
    const content = `
      <div class="page-head"><h1>Add Guest</h1></div>
      <div class="card"><form method="POST" action="/guests">${guestForm({}, groups)}<button type="submit" class="btn btn-lg">Save guest</button></form></div>
    `;
    sendHtml(ctx.res, page({ user, active: "guests", title: "Add Guest", content }));
  });

  router.post("/guests", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "guests", "/guests")) return;
    const b = ctx.body;
    const result = run(
      `INSERT INTO guests (full_name, gender, age, mobile, whatsapp, email, group_id, relationship, accompanying_count, arrival_date, arrival_time, departure_date, departure_time, travel_details, room_required, bed_requirement, food_preference, special_requirements, notes, status, portal_token)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.full_name, b.gender, Number(b.age) || null, b.mobile, b.whatsapp, b.email, b.group_id || null, b.relationship,
        Number(b.accompanying_count) || 0, b.arrival_date, b.arrival_time, b.departure_date, b.departure_time, b.travel_details,
        b.room_required ? 1 : 0, b.bed_requirement, b.food_preference, b.special_requirements, b.notes, b.status || "Invited", newToken(),
      ]
    );
    const guestId = Number(result.lastInsertRowid);
    logAudit(user, "CREATE", "guest", guestId, b.full_name);
    redirect(ctx.res, `/guests/${guestId}`);
  });

  router.get("/guests/:id/edit", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "guests", "/guests")) return;
    const g = get("SELECT * FROM guests WHERE id = ?", [ctx.params.id]);
    if (!g) return redirect(ctx.res, "/guests");
    const groups = all("SELECT * FROM guest_groups ORDER BY name");
    const content = `
      <div class="page-head"><h1>Edit ${escapeHtml(g.full_name)}</h1></div>
      <div class="card"><form method="POST" action="/guests/${g.id}">${guestForm(g, groups)}<button type="submit" class="btn btn-lg">Save changes</button></form></div>
    `;
    sendHtml(ctx.res, page({ user, active: "guests", title: "Edit Guest", content }));
  });

  router.post("/guests/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "guests", "/guests")) return;
    const b = ctx.body;
    run(
      `UPDATE guests SET full_name=?, gender=?, age=?, mobile=?, whatsapp=?, email=?, group_id=?, relationship=?, accompanying_count=?, arrival_date=?, arrival_time=?, departure_date=?, departure_time=?, travel_details=?, room_required=?, bed_requirement=?, food_preference=?, special_requirements=?, notes=?, status=? WHERE id=?`,
      [
        b.full_name, b.gender, Number(b.age) || null, b.mobile, b.whatsapp, b.email, b.group_id || null, b.relationship,
        Number(b.accompanying_count) || 0, b.arrival_date, b.arrival_time, b.departure_date, b.departure_time, b.travel_details,
        b.room_required ? 1 : 0, b.bed_requirement, b.food_preference, b.special_requirements, b.notes, b.status || "Invited", ctx.params.id,
      ]
    );
    logAudit(user, "UPDATE", "guest", Number(ctx.params.id), b.full_name);
    redirect(ctx.res, `/guests/${ctx.params.id}`);
  });

  router.post("/guests/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "guests", "/guests")) return;
    run("DELETE FROM guests WHERE id = ?", [ctx.params.id]);
    logAudit(user, "DELETE", "guest", Number(ctx.params.id), "");
    redirect(ctx.res, "/guests");
  });

  router.post("/guests/:id/resend-link", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "guests", "/guests")) return;
    run("UPDATE guests SET portal_token = ? WHERE id = ?", [newToken(), ctx.params.id]);
    logAudit(user, "RESEND_LINK", "guest", Number(ctx.params.id), "");
    redirect(ctx.res, `/guests/${ctx.params.id}`);
  });

  router.get("/guests/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const g = get("SELECT * FROM guests WHERE id = ?", [ctx.params.id]);
    if (!g) return redirect(ctx.res, "/guests");
    const canEdit = canWrite(user.role, "guests");
    const group = g.group_id ? get("SELECT * FROM guest_groups WHERE id = ?", [g.group_id]) : null;
    const room = get(
      `SELECT r.*, h.name as hotel_name FROM room_allocations ra JOIN rooms r ON r.id=ra.room_id JOIN hotels h ON h.id=r.hotel_id WHERE ra.guest_id = ? AND ra.checked_out_at IS NULL`,
      [g.id]
    );
    const portalUrl = `/guest/secure/${g.portal_token}`;

    const content = `
      <div class="page-head">
        <div><h1>${escapeHtml(g.full_name)}</h1><p class="lede">${escapeHtml(g.relationship || "Guest")}${group ? " · " + escapeHtml(group.name) : ""}</p></div>
        ${canEdit ? `<div style="display:flex;gap:8px;"><a href="/guests/${g.id}/edit" class="btn btn-secondary">Edit</a>
        <form method="POST" action="/guests/${g.id}/delete" data-confirm="Delete this guest?"><button class="btn btn-danger">Delete</button></form></div>` : ""}
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2>Details</h2>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">Mobile</span><span class="kv-value">${escapeHtml(g.mobile || "—")}</span></div>
            <div class="kv-row"><span class="kv-label">WhatsApp</span><span class="kv-value">${escapeHtml(g.whatsapp || "—")}</span></div>
            <div class="kv-row"><span class="kv-label">Email</span><span class="kv-value">${escapeHtml(g.email || "—")}</span></div>
            <div class="kv-row"><span class="kv-label">Accompanying</span><span class="kv-value">${g.accompanying_count || 0}</span></div>
            <div class="kv-row"><span class="kv-label">Arrival</span><span class="kv-value">${g.arrival_date ? formatDate(g.arrival_date) + " " + (g.arrival_time || "") : "—"}</span></div>
            <div class="kv-row"><span class="kv-label">Departure</span><span class="kv-value">${g.departure_date ? formatDate(g.departure_date) + " " + (g.departure_time || "") : "—"}</span></div>
            <div class="kv-row"><span class="kv-label">Travel</span><span class="kv-value">${escapeHtml(g.travel_details || "—")}</span></div>
            <div class="kv-row"><span class="kv-label">Food preference</span><span class="kv-value">${escapeHtml(g.food_preference || "—")}</span></div>
            <div class="kv-row"><span class="kv-label">Status</span><span class="kv-value">${badge(g.status, statusVariant(g.status))}</span></div>
          </div>
        </div>
        <div class="card">
          <h2>Stay &amp; KYC</h2>
          <div class="kv-list" style="margin-bottom:16px;">
            <div class="kv-row"><span class="kv-label">Room required</span><span class="kv-value">${g.room_required ? "Yes" : "No"}</span></div>
            <div class="kv-row"><span class="kv-label">Bed requirement</span><span class="kv-value">${escapeHtml(g.bed_requirement || "—")}</span></div>
            <div class="kv-row"><span class="kv-label">Current room</span><span class="kv-value">${room ? `${escapeHtml(room.room_number)} (${escapeHtml(room.hotel_name)})` : "Unallocated"}</span></div>
            <div class="kv-row"><span class="kv-label">Aadhaar</span><span class="kv-value">${maskAadhaar(g.aadhaar_number)}</span></div>
            <div class="kv-row"><span class="kv-label">KYC status</span><span class="kv-value">${badge(g.kyc_status, kycVariant(g.kyc_status))}</span></div>
          </div>
          ${!room && g.room_required ? `<a href="/rooms?guest_id=${g.id}" class="btn btn-secondary btn-sm">Allocate a room</a>` : ""}
          <div class="section-title">Guest self-service link</div>
          <div class="field-row" style="align-items:end;">
            <div class="field" style="flex:1;"><input type="text" readonly value="${escapeHtml(portalUrl)}" id="portal-link" /></div>
            <div class="field"><button class="btn btn-secondary btn-sm" data-copy="${escapeHtml(portalUrl)}">Copy link</button></div>
          </div>
          ${canEdit ? `<form method="POST" action="/guests/${g.id}/resend-link"><button class="btn btn-secondary btn-sm">Regenerate link</button></form>` : ""}
        </div>
      </div>
      ${g.special_requirements || g.notes ? `<div class="card" style="margin-top:18px;"><h2>Notes</h2>${g.special_requirements ? `<p><strong>Special requirements:</strong> ${escapeHtml(g.special_requirements)}</p>` : ""}${g.notes ? `<p>${escapeHtml(g.notes)}</p>` : ""}</div>` : ""}
    `;
    sendHtml(ctx.res, page({ user, active: "guests", title: g.full_name, content }));
  });

  // Directory of every guest portal link, for easy sharing.
  router.get("/guest-links", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const guests = all("SELECT * FROM guests ORDER BY full_name");
    const rows = guests
      .map(
        (g) => `<tr>
        <td><a href="/guests/${g.id}">${escapeHtml(g.full_name)}</a></td>
        <td>${escapeHtml(g.mobile || "—")}</td>
        <td>${badge(g.kyc_status, kycVariant(g.kyc_status))}</td>
        <td><input type="text" readonly value="/guest/secure/${g.portal_token}" style="font-size:12px;" /></td>
        <td><button class="btn btn-secondary btn-sm" data-copy="/guest/secure/${g.portal_token}">Copy</button></td>
      </tr>`
      )
      .join("");
    const content = `
      <div class="page-head"><div><h1>Guest Portal Links</h1><p class="lede">Share each guest's private link so they can confirm details and upload KYC.</p></div></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Guest</th><th>Mobile</th><th>KYC</th><th>Link</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">${emptyState("No guests yet.")}</td></tr>`}</tbody></table></div></div>
    `;
    sendHtml(ctx.res, page({ user, active: "guests", title: "Guest Portal Links", content }));
  });
}
