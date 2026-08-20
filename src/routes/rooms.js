import { all, get, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page, badge, icon, emptyState } from "../lib/render.js";
import { escapeHtml, formatINR, formatDateTime } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";
import { canWrite, ROOM_TYPES, ROOM_STATUSES, ROOM_TYPE_DEFAULTS } from "../lib/constants.js";

function hotelPrefix(name) {
  const words = String(name || "H").trim().split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  const initials = words.map((w) => w[0].toUpperCase()).join("");
  return (initials || "H").slice(0, 3);
}

// Generates `quantities[type]` rooms of each type for a hotel in one go, auto-numbered
// and auto-floored (5 rooms per floor) so a whole hotel's inventory can be set up in
// one form instead of adding rooms one at a time.
function bulkCreateRooms(hotel, quantities) {
  const prefix = hotelPrefix(hotel.name);
  const existing = get("SELECT COUNT(*) c FROM rooms WHERE hotel_id = ?", [hotel.id]).c;
  let cursor = existing;
  let created = 0;
  for (const type of ROOM_TYPES) {
    const qty = Number(quantities[type]?.qty) || 0;
    if (qty <= 0) continue;
    const rate = Number(quantities[type]?.rate) || ROOM_TYPE_DEFAULTS[type].rate;
    for (let i = 0; i < qty; i++) {
      cursor++;
      const roomNumber = `${prefix}${100 + cursor}`;
      const floor = String(Math.ceil(cursor / 5));
      run(
        `INSERT INTO rooms (hotel_id, room_number, room_type, floor, max_occupancy, bed_configuration, rate, status) VALUES (?,?,?,?,?,?,?, 'Available')`,
        [hotel.id, roomNumber, type, floor, ROOM_TYPE_DEFAULTS[type].max_occupancy, "", rate]
      );
      created++;
    }
  }
  return created;
}

function quantitiesFromBody(b) {
  const out = {};
  for (const type of ROOM_TYPES) {
    out[type] = { qty: b[`qty_${type}`], rate: b[`rate_${type}`] };
  }
  return out;
}

function bulkRoomFields(defaultsOnly = true) {
  return `
    <div class="section-title" style="margin-top:18px;">${defaultsOnly ? "Generate rooms automatically (optional)" : "Add more rooms in bulk"}</div>
    <p class="small muted">Tell us how many of each room type this hotel has — we'll create and number them for you. Leave a quantity at 0 to skip that type.</p>
    <div class="field-row">
      ${ROOM_TYPES.map(
        (t) => `<div class="field">
        <label>${t} — qty &amp; rate (₹/night)</label>
        <div style="display:flex;gap:6px;">
          <input type="number" name="qty_${t}" value="0" min="0" style="width:70px;" />
          <input type="number" name="rate_${t}" value="${ROOM_TYPE_DEFAULTS[t].rate}" min="0" />
        </div>
      </div>`
      ).join("")}
    </div>
  `;
}

function roomStatusVariant(status) {
  if (status === "Available") return "good";
  if (status === "Occupied") return "gold";
  if (status === "Reserved") return "neutral";
  if (status === "Cleaning") return "warning";
  return "critical";
}

function occupantsOf(roomId) {
  return all(
    `SELECT ra.*, g.full_name, g.mobile FROM room_allocations ra JOIN guests g ON g.id = ra.guest_id WHERE ra.room_id = ? AND ra.checked_out_at IS NULL`,
    [roomId]
  );
}

export function registerRoomRoutes(router) {
  router.get("/rooms", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const canEdit = canWrite(user.role, "rooms");
    const { hotel_id, status: statusFilter, room_type, view } = ctx.query;

    const hotels = all("SELECT * FROM hotels ORDER BY name");
    let roomSql = "SELECT * FROM rooms WHERE 1=1";
    const params = [];
    if (hotel_id) { roomSql += " AND hotel_id = ?"; params.push(hotel_id); }
    if (statusFilter) { roomSql += " AND status = ?"; params.push(statusFilter); }
    if (room_type) { roomSql += " AND room_type = ?"; params.push(room_type); }
    roomSql += " ORDER BY room_number";
    const rooms = all(roomSql, params);

    const unallocated = all(
      `SELECT * FROM guests WHERE room_required = 1 AND status != 'Not Coming'
       AND NOT EXISTS (SELECT 1 FROM room_allocations ra WHERE ra.guest_id = guests.id AND ra.checked_out_at IS NULL)
       ORDER BY full_name`
    );

    const totalRooms = get("SELECT COUNT(*) c FROM rooms").c;
    const occupiedRooms = get(`SELECT COUNT(DISTINCT room_id) c FROM room_allocations WHERE checked_out_at IS NULL`).c;

    const roomCards = rooms
      .map((r) => {
        const occ = occupantsOf(r.id);
        const hotel = hotels.find((h) => h.id === r.hotel_id);
        const over = occ.length > r.max_occupancy;
        return `<div class="card">
          <div class="card-row">
            <div><strong>${escapeHtml(r.room_number)}</strong><div class="small muted">${escapeHtml(hotel?.name || "")} · ${escapeHtml(r.room_type)} · Floor ${escapeHtml(r.floor || "—")}</div></div>
            ${badge(r.status, roomStatusVariant(r.status))}
          </div>
          <div class="small muted" style="margin-bottom:8px;">${occ.length}/${r.max_occupancy} occupied ${r.rate ? "· " + formatINR(r.rate) + "/night" : ""} ${over ? badge("Over capacity", "critical") : ""}</div>
          ${occ.length ? `<ul style="margin:0 0 10px;padding-left:18px;font-size:13px;">${occ.map((o) => `<li>${escapeHtml(o.full_name)} ${o.checked_in_at ? badge("Checked in", "good") : `<form method="POST" action="/rooms/allocations/${o.id}/checkin" style="display:inline;"><button class="btn-sm btn-secondary btn">Check in</button></form>`}
            ${canEdit ? `<form method="POST" action="/rooms/allocations/${o.id}/checkout" style="display:inline;margin-left:4px;"><button class="btn-sm btn-secondary btn">Check out</button></form>
            <form method="POST" action="/rooms/allocations/${o.id}/remove" style="display:inline;margin-left:4px;" data-confirm="Remove this allocation?"><button class="btn-sm btn-danger btn">✕</button></form>` : ""}</li>`).join("")}</ul>` : `<div class="small muted" style="margin-bottom:10px;">No occupants.</div>`}
          ${canEdit ? `<details><summary class="small" style="cursor:pointer;color:var(--gold-dark);font-weight:700;">Allocate guest</summary>
            <form method="POST" action="/rooms/${r.id}/allocate" style="margin-top:8px;display:flex;gap:8px;">
              <select name="guest_id" required style="flex:1;">
                <option value="">Select guest</option>
                ${unallocated.map((g) => `<option value="${g.id}">${escapeHtml(g.full_name)}</option>`).join("")}
              </select>
              <button class="btn btn-sm">Assign</button>
            </form>
          </details>
          <div style="margin-top:8px;display:flex;gap:6px;">
            <a href="/rooms/${r.id}/edit" class="btn btn-secondary btn-sm">Edit</a>
            <form method="POST" action="/rooms/${r.id}/delete" data-confirm="Delete this room?"><button class="btn btn-danger btn-sm">Delete</button></form>
          </div>` : ""}
        </div>`;
      })
      .join("");

    const hotelCards = hotels
      .map((h) => {
        const hRooms = all("SELECT * FROM rooms WHERE hotel_id = ?", [h.id]);
        const hOcc = get(
          `SELECT COUNT(DISTINCT ra.room_id) c FROM room_allocations ra JOIN rooms r ON r.id=ra.room_id WHERE r.hotel_id = ? AND ra.checked_out_at IS NULL`,
          [h.id]
        ).c;
        return `<div class="stat-tile">
          <div class="stat-label">${escapeHtml(h.name)}</div>
          <div class="stat-value">${hOcc}/${hRooms.length}</div>
          <div class="stat-sub">rooms occupied ${canEdit ? `· <a href="/rooms/hotels/${h.id}/edit">edit</a>` : ""}</div>
        </div>`;
      })
      .join("");

    const content = `
      <div class="page-head">
        <div><h1>Rooms</h1><p class="lede">${occupiedRooms}/${totalRooms} rooms occupied across ${hotels.length} hotel${hotels.length === 1 ? "" : "s"}.</p></div>
        ${canEdit ? `<div style="display:flex;gap:8px;"><a href="/rooms/hotels/new" class="btn btn-secondary">${icon("plus")}Add Hotel</a><a href="/rooms/new" class="btn">${icon("plus")}Add Room</a></div>` : ""}
      </div>
      ${ctx.query.created_rooms ? `<div class="flash success">${ctx.query.created_rooms} room${ctx.query.created_rooms === "1" ? "" : "s"} generated automatically.</div>` : ""}

      <div class="stat-grid">${hotelCards || `<div class="empty-state">No hotels added yet.</div>`}</div>

      ${unallocated.length ? `<div class="card" style="margin-bottom:18px;border-color:var(--warning);">
        <h2>${unallocated.length} unallocated guest${unallocated.length === 1 ? "" : "s"}</h2>
        <div class="pill-row">${unallocated.map((g) => `<a href="/guests/${g.id}" class="badge badge-warning">${escapeHtml(g.full_name)}</a>`).join("")}</div>
      </div>` : ""}

      <div class="card">
        <form class="filter-bar" method="GET" action="/rooms">
          <select name="hotel_id" onchange="this.form.submit()"><option value="">All hotels</option>${hotels.map((h) => `<option value="${h.id}" ${hotel_id === String(h.id) ? "selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select>
          <select name="status" onchange="this.form.submit()"><option value="">Any status</option>${ROOM_STATUSES.map((s) => `<option ${statusFilter === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          <select name="room_type" onchange="this.form.submit()"><option value="">Any type</option>${ROOM_TYPES.map((t) => `<option ${room_type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          <a href="/rooms" class="btn btn-secondary btn-sm">Clear</a>
        </form>
      </div>
      <div class="grid grid-3">${roomCards || `<div class="empty-state">No rooms match.</div>`}</div>
    `;
    sendHtml(ctx.res, page({ user, active: "rooms", title: "Rooms", content }));
  });

  // ---------------------------------------------------------------- Hotels
  router.get("/rooms/hotels/new", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const content = `<div class="page-head"><h1>Add Hotel</h1></div>
      <div class="card"><form method="POST" action="/rooms/hotels">
        <div class="field-row">
          <div class="field"><label>Hotel name *</label><input type="text" name="name" required /></div>
          <div class="field"><label>Total rooms</label><input type="number" name="total_rooms" value="0" /></div>
        </div>
        <div class="field"><label>Address</label><input type="text" name="address" /></div>
        <div class="field-row">
          <div class="field"><label>Contact person</label><input type="text" name="contact_person" /></div>
          <div class="field"><label>Contact phone</label><input type="tel" name="contact_phone" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Check-in time</label><input type="time" name="check_in_time" value="14:00" /></div>
          <div class="field"><label>Check-out time</label><input type="time" name="check_out_time" value="11:00" /></div>
        </div>
        ${bulkRoomFields()}
        <button class="btn btn-lg" style="margin-top:14px;">Save hotel</button>
      </form></div>`;
    sendHtml(ctx.res, page({ user, active: "rooms", title: "Add Hotel", content }));
  });

  router.post("/rooms/hotels", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const b = ctx.body;
    const result = run(
      `INSERT INTO hotels (name, address, contact_person, contact_phone, total_rooms, check_in_time, check_out_time) VALUES (?,?,?,?,?,?,?)`,
      [b.name, b.address, b.contact_person, b.contact_phone, Number(b.total_rooms) || 0, b.check_in_time, b.check_out_time]
    );
    const hotelId = Number(result.lastInsertRowid);
    logAudit(user, "CREATE", "hotel", hotelId, b.name);
    const created = bulkCreateRooms({ id: hotelId, name: b.name }, quantitiesFromBody(b));
    if (created > 0) {
      run("UPDATE hotels SET total_rooms = (SELECT COUNT(*) FROM rooms WHERE hotel_id = ?) WHERE id = ?", [hotelId, hotelId]);
      logAudit(user, "BULK_CREATE", "room", hotelId, `${created} rooms generated`);
    }
    redirect(ctx.res, `/rooms?hotel_id=${hotelId}${created ? "&created_rooms=" + created : ""}`);
  });

  router.post("/rooms/hotels/:id/bulk-add", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const hotel = get("SELECT * FROM hotels WHERE id = ?", [ctx.params.id]);
    if (!hotel) return redirect(ctx.res, "/rooms");
    const created = bulkCreateRooms(hotel, quantitiesFromBody(ctx.body));
    if (created > 0) {
      run("UPDATE hotels SET total_rooms = (SELECT COUNT(*) FROM rooms WHERE hotel_id = ?) WHERE id = ?", [hotel.id, hotel.id]);
      logAudit(user, "BULK_CREATE", "room", hotel.id, `${created} rooms generated`);
    }
    redirect(ctx.res, `/rooms?hotel_id=${hotel.id}${created ? "&created_rooms=" + created : ""}`);
  });

  router.get("/rooms/hotels/:id/edit", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const h = get("SELECT * FROM hotels WHERE id = ?", [ctx.params.id]);
    if (!h) return redirect(ctx.res, "/rooms");
    const content = `<div class="page-head"><h1>Edit ${escapeHtml(h.name)}</h1></div>
      <div class="card"><form method="POST" action="/rooms/hotels/${h.id}">
        <div class="field-row">
          <div class="field"><label>Hotel name *</label><input type="text" name="name" required value="${escapeHtml(h.name)}" /></div>
          <div class="field"><label>Total rooms</label><input type="number" name="total_rooms" value="${h.total_rooms}" /></div>
        </div>
        <div class="field"><label>Address</label><input type="text" name="address" value="${escapeHtml(h.address || "")}" /></div>
        <div class="field-row">
          <div class="field"><label>Contact person</label><input type="text" name="contact_person" value="${escapeHtml(h.contact_person || "")}" /></div>
          <div class="field"><label>Contact phone</label><input type="tel" name="contact_phone" value="${escapeHtml(h.contact_phone || "")}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Check-in time</label><input type="time" name="check_in_time" value="${escapeHtml(h.check_in_time || "")}" /></div>
          <div class="field"><label>Check-out time</label><input type="time" name="check_out_time" value="${escapeHtml(h.check_out_time || "")}" /></div>
        </div>
        <button class="btn btn-lg">Save changes</button>
      </form>
      </div>
      <div class="card">
        <form method="POST" action="/rooms/hotels/${h.id}/bulk-add">
          ${bulkRoomFields(false)}
          <button class="btn" style="margin-top:14px;">${icon("plus")}Generate rooms</button>
        </form>
      </div>
      <div class="card">
        <form method="POST" action="/rooms/hotels/${h.id}/delete" data-confirm="Delete this hotel and all its rooms?"><button class="btn btn-danger">Delete hotel</button></form>
      </div>`;
    sendHtml(ctx.res, page({ user, active: "rooms", title: "Edit Hotel", content }));
  });

  router.post("/rooms/hotels/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const b = ctx.body;
    run(
      `UPDATE hotels SET name=?, address=?, contact_person=?, contact_phone=?, total_rooms=?, check_in_time=?, check_out_time=? WHERE id=?`,
      [b.name, b.address, b.contact_person, b.contact_phone, Number(b.total_rooms) || 0, b.check_in_time, b.check_out_time, ctx.params.id]
    );
    redirect(ctx.res, "/rooms");
  });

  router.post("/rooms/hotels/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    run("DELETE FROM hotels WHERE id = ?", [ctx.params.id]);
    logAudit(user, "DELETE", "hotel", Number(ctx.params.id), "");
    redirect(ctx.res, "/rooms");
  });

  // ---------------------------------------------------------------- Rooms CRUD
  router.get("/rooms/new", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const hotels = all("SELECT * FROM hotels ORDER BY name");
    const content = `<div class="page-head"><h1>Add Room</h1></div>
      <div class="card"><form method="POST" action="/rooms">
        <div class="field-row">
          <div class="field"><label>Hotel *</label><select name="hotel_id" required>${hotels.map((h) => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join("")}</select></div>
          <div class="field"><label>Room number *</label><input type="text" name="room_number" required /></div>
          <div class="field"><label>Room type</label><select name="room_type">${ROOM_TYPES.map((t) => `<option>${t}</option>`).join("")}</select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Floor</label><input type="text" name="floor" /></div>
          <div class="field"><label>Max occupancy</label><input type="number" name="max_occupancy" value="2" /></div>
          <div class="field"><label>Rate (₹/night)</label><input type="number" name="rate" value="0" /></div>
        </div>
        <div class="field"><label>Bed configuration</label><input type="text" name="bed_configuration" placeholder="e.g. 1 king bed" /></div>
        <button class="btn btn-lg">Save room</button>
      </form></div>`;
    sendHtml(ctx.res, page({ user, active: "rooms", title: "Add Room", content }));
  });

  router.post("/rooms", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const b = ctx.body;
    const result = run(
      `INSERT INTO rooms (hotel_id, room_number, room_type, floor, max_occupancy, bed_configuration, rate, status) VALUES (?,?,?,?,?,?,?, 'Available')`,
      [b.hotel_id, b.room_number, b.room_type, b.floor, Number(b.max_occupancy) || 2, b.bed_configuration, Number(b.rate) || 0]
    );
    logAudit(user, "CREATE", "room", Number(result.lastInsertRowid), b.room_number);
    redirect(ctx.res, "/rooms");
  });

  router.get("/rooms/:id/edit", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const r = get("SELECT * FROM rooms WHERE id = ?", [ctx.params.id]);
    if (!r) return redirect(ctx.res, "/rooms");
    const hotels = all("SELECT * FROM hotels ORDER BY name");
    const content = `<div class="page-head"><h1>Edit Room ${escapeHtml(r.room_number)}</h1></div>
      <div class="card"><form method="POST" action="/rooms/${r.id}">
        <div class="field-row">
          <div class="field"><label>Hotel *</label><select name="hotel_id">${hotels.map((h) => `<option value="${h.id}" ${h.id === r.hotel_id ? "selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select></div>
          <div class="field"><label>Room number *</label><input type="text" name="room_number" value="${escapeHtml(r.room_number)}" required /></div>
          <div class="field"><label>Room type</label><select name="room_type">${ROOM_TYPES.map((t) => `<option ${r.room_type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Floor</label><input type="text" name="floor" value="${escapeHtml(r.floor || "")}" /></div>
          <div class="field"><label>Max occupancy</label><input type="number" name="max_occupancy" value="${r.max_occupancy}" /></div>
          <div class="field"><label>Rate (₹/night)</label><input type="number" name="rate" value="${r.rate}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Bed configuration</label><input type="text" name="bed_configuration" value="${escapeHtml(r.bed_configuration || "")}" /></div>
          <div class="field"><label>Status</label><select name="status">${ROOM_STATUSES.map((s) => `<option ${r.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        </div>
        <button class="btn btn-lg">Save changes</button>
      </form></div>`;
    sendHtml(ctx.res, page({ user, active: "rooms", title: "Edit Room", content }));
  });

  router.post("/rooms/:id", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const b = ctx.body;
    run(
      `UPDATE rooms SET hotel_id=?, room_number=?, room_type=?, floor=?, max_occupancy=?, bed_configuration=?, rate=?, status=? WHERE id=?`,
      [b.hotel_id, b.room_number, b.room_type, b.floor, Number(b.max_occupancy) || 2, b.bed_configuration, Number(b.rate) || 0, b.status, ctx.params.id]
    );
    redirect(ctx.res, "/rooms");
  });

  router.post("/rooms/:id/delete", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    run("DELETE FROM rooms WHERE id = ?", [ctx.params.id]);
    logAudit(user, "DELETE", "room", Number(ctx.params.id), "");
    redirect(ctx.res, "/rooms");
  });

  // ---------------------------------------------------------------- Allocation / check-in / check-out
  router.post("/rooms/:id/allocate", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const room = get("SELECT * FROM rooms WHERE id = ?", [ctx.params.id]);
    if (!room || !ctx.body.guest_id) return redirect(ctx.res, "/rooms");
    run("INSERT INTO room_allocations (room_id, guest_id) VALUES (?, ?)", [room.id, ctx.body.guest_id]);
    if (room.status === "Available") run("UPDATE rooms SET status='Occupied' WHERE id=?", [room.id]);
    logAudit(user, "ALLOCATE", "room", room.id, `guest ${ctx.body.guest_id}`);
    redirect(ctx.res, "/rooms");
  });

  router.post("/rooms/allocations/:allocId/checkin", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const alloc = get("SELECT * FROM room_allocations WHERE id = ?", [ctx.params.allocId]);
    if (!alloc) return redirect(ctx.res, "/rooms");
    run("UPDATE room_allocations SET checked_in_at = datetime('now') WHERE id = ?", [alloc.id]);
    run("UPDATE guests SET status = 'Checked In' WHERE id = ?", [alloc.guest_id]);
    logAudit(user, "CHECK_IN", "room_allocation", alloc.id, "");
    redirect(ctx.res, "/rooms");
  });

  router.post("/rooms/allocations/:allocId/checkout", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const alloc = get("SELECT * FROM room_allocations WHERE id = ?", [ctx.params.allocId]);
    if (!alloc) return redirect(ctx.res, "/rooms");
    run("UPDATE room_allocations SET checked_out_at = datetime('now') WHERE id = ?", [alloc.id]);
    run("UPDATE guests SET status = 'Checked Out' WHERE id = ?", [alloc.guest_id]);
    const stillOccupied = get(
      "SELECT COUNT(*) c FROM room_allocations WHERE room_id = ? AND checked_out_at IS NULL",
      [alloc.room_id]
    ).c;
    if (stillOccupied === 0) run("UPDATE rooms SET status='Cleaning' WHERE id=?", [alloc.room_id]);
    logAudit(user, "CHECK_OUT", "room_allocation", alloc.id, "");
    redirect(ctx.res, "/rooms");
  });

  router.post("/rooms/allocations/:allocId/remove", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "rooms", "/rooms")) return;
    const alloc = get("SELECT * FROM room_allocations WHERE id = ?", [ctx.params.allocId]);
    if (alloc) {
      run("DELETE FROM room_allocations WHERE id = ?", [alloc.id]);
      const stillOccupied = get("SELECT COUNT(*) c FROM room_allocations WHERE room_id = ? AND checked_out_at IS NULL", [alloc.room_id]).c;
      if (stillOccupied === 0) run("UPDATE rooms SET status='Available' WHERE id=? AND status='Occupied'", [alloc.room_id]);
    }
    redirect(ctx.res, "/rooms");
  });
}
