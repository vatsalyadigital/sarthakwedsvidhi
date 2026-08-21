import { all, get } from "../lib/db.js";
import { requireUser } from "../lib/guard.js";
import { sendHtml, sendCsv, toCsv, redirect } from "../lib/router.js";
import { page, icon, emptyState } from "../lib/render.js";
import { escapeHtml, formatINR, formatDate, maskAadhaar } from "../lib/format.js";
import { dashboardTotals, vendorSummary } from "../lib/calc.js";

const KYC_VIEW_ROLES = ["SUPER_ADMIN", "GUEST_MANAGER"];

export function registerReportRoutes(router) {
  router.get("/reports", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const totals = dashboardTotals();

    const links = [
      { title: "Financial Report", href: "/reports/financial", desc: "Budget, estimated cost, paid, outstanding." },
      { title: "Vendor Report", href: "/reports/vendors", desc: "Contract, paid and outstanding per vendor." },
      { title: "Guest Report", href: "/reports/guests", desc: "Name, family, mobile, arrival, departure, room." },
      { title: "Room Report", href: "/reports/rooms", desc: "Room, hotel, occupants, check-in, check-out, status." },
      { title: "KYC Report", href: "/reports/kyc", desc: "Guest, KYC status, submission date. Restricted access." },
    ];

    const content = `
      <div class="page-head"><div><h1>Reports</h1><p class="lede">Downloadable reports across every module.</p></div></div>
      <div class="grid grid-2">
        ${links
          .map(
            (l) => `<div class="card">
          <h2>${l.title}</h2>
          <p class="small secondary-text">${l.desc}</p>
          <a href="${l.href}" class="btn btn-secondary btn-sm">View report</a>
        </div>`
          )
          .join("")}
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "reports", title: "Reports", content }));
  });

  // ---------------------------------------------------------------- Financial
  router.get("/reports/financial", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const t = dashboardTotals();
    const content = `
      <div class="page-head"><h1>Financial Report</h1></div>
      <div class="card">
        <div class="kv-list">
          <div class="kv-row"><span class="kv-label">Total Wedding Budget</span><span class="kv-value">${formatINR(t.totalBudget)}</span></div>
          <div class="kv-row"><span class="kv-label">Total Estimated (vendor contracts)</span><span class="kv-value">${formatINR(t.totalEstimated)}</span></div>
          <div class="kv-row"><span class="kv-label">Total Paid</span><span class="kv-value">${formatINR(t.totalPaid)}</span></div>
          <div class="kv-row"><span class="kv-label">Total Outstanding</span><span class="kv-value">${formatINR(t.totalOutstanding)}</span></div>
        </div>
      </div>
    `;
    sendHtml(ctx.res, page({ user, active: "reports", title: "Financial Report", content }));
  });

  // ---------------------------------------------------------------- Vendors
  function vendorReportRows() {
    return all("SELECT * FROM vendors ORDER BY name").map((v) => {
      const s = vendorSummary(v);
      return { name: v.name, category: v.category, contract: s.finalAmount, paid: s.totalPaid, outstanding: s.outstanding, status: s.status };
    });
  }

  router.get("/reports/vendors", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const rows = vendorReportRows();
    const content = `
      <div class="page-head"><h1>Vendor Report</h1><a href="/reports/vendors.csv" class="btn btn-secondary btn-sm">Export CSV</a></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Vendor</th><th>Category</th><th class="num">Contract</th><th class="num">Paid</th><th class="num">Outstanding</th><th>Status</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.category)}</td><td class="num">${formatINR(r.contract)}</td><td class="num">${formatINR(r.paid)}</td><td class="num">${formatINR(r.outstanding)}</td><td>${escapeHtml(r.status)}</td></tr>`).join("") || `<tr><td colspan="6">${emptyState("No vendors yet.")}</td></tr>`}</tbody></table></div></div>
    `;
    sendHtml(ctx.res, page({ user, active: "reports", title: "Vendor Report", content }));
  });

  router.get("/reports/vendors.csv", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const csv = toCsv(vendorReportRows(), [
      { label: "Vendor", value: "name" }, { label: "Category", value: "category" },
      { label: "Contract", value: "contract" }, { label: "Paid", value: "paid" },
      { label: "Outstanding", value: "outstanding" }, { label: "Status", value: "status" },
    ]);
    sendCsv(ctx.res, "vendor-report.csv", csv);
  });

  // ---------------------------------------------------------------- Guests
  function guestReportRows() {
    return all(`SELECT g.*, gr.name as group_name FROM guests g LEFT JOIN guest_groups gr ON gr.id=g.group_id ORDER BY g.full_name`).map((g) => {
      const room = get(
        `SELECT r.room_number FROM room_allocations ra JOIN rooms r ON r.id=ra.room_id WHERE ra.guest_id=? AND ra.checked_out_at IS NULL`,
        [g.id]
      );
      return { name: g.full_name, family: g.group_name || "", mobile: g.mobile || "", arrival: g.arrival_date || "", departure: g.departure_date || "", room: room ? room.room_number : "" };
    });
  }

  router.get("/reports/guests", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const rows = guestReportRows();
    const content = `
      <div class="page-head"><h1>Guest Report</h1><a href="/reports/guests.csv" class="btn btn-secondary btn-sm">Export CSV</a></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Family</th><th>Mobile</th><th>Arrival</th><th>Departure</th><th>Room</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.family)}</td><td>${escapeHtml(r.mobile)}</td><td>${r.arrival ? formatDate(r.arrival) : "—"}</td><td>${r.departure ? formatDate(r.departure) : "—"}</td><td>${escapeHtml(r.room || "—")}</td></tr>`).join("") || `<tr><td colspan="6">${emptyState("No guests.")}</td></tr>`}</tbody></table></div></div>
    `;
    sendHtml(ctx.res, page({ user, active: "reports", title: "Guest Report", content }));
  });

  router.get("/reports/guests.csv", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const csv = toCsv(guestReportRows(), [
      { label: "Name", value: "name" }, { label: "Family", value: "family" }, { label: "Mobile", value: "mobile" },
      { label: "Arrival", value: "arrival" }, { label: "Departure", value: "departure" }, { label: "Room", value: "room" },
    ]);
    sendCsv(ctx.res, "guest-report.csv", csv);
  });

  // ---------------------------------------------------------------- Rooms
  function roomReportRows() {
    return all(`SELECT r.*, h.name as hotel_name FROM rooms r JOIN hotels h ON h.id=r.hotel_id ORDER BY h.name, r.room_number`).map((r) => {
      const occupants = all(
        `SELECT g.full_name, ra.checked_in_at, ra.checked_out_at FROM room_allocations ra JOIN guests g ON g.id=ra.guest_id WHERE ra.room_id=? AND ra.checked_out_at IS NULL`,
        [r.id]
      );
      return {
        room: r.room_number, hotel: r.hotel_name,
        occupants: occupants.map((o) => o.full_name).join("; "),
        checked_in: occupants.some((o) => o.checked_in_at) ? "Yes" : "No",
        status: r.status,
      };
    });
  }

  router.get("/reports/rooms", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const rows = roomReportRows();
    const content = `
      <div class="page-head"><h1>Room Report</h1><a href="/reports/rooms.csv" class="btn btn-secondary btn-sm">Export CSV</a></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Room</th><th>Hotel</th><th>Occupants</th><th>Checked in</th><th>Status</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.room)}</td><td>${escapeHtml(r.hotel)}</td><td class="small">${escapeHtml(r.occupants || "—")}</td><td>${r.checked_in}</td><td>${escapeHtml(r.status)}</td></tr>`).join("") || `<tr><td colspan="5">${emptyState("No rooms.")}</td></tr>`}</tbody></table></div></div>
    `;
    sendHtml(ctx.res, page({ user, active: "reports", title: "Room Report", content }));
  });

  router.get("/reports/rooms.csv", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const csv = toCsv(roomReportRows(), [
      { label: "Room", value: "room" }, { label: "Hotel", value: "hotel" }, { label: "Occupants", value: "occupants" },
      { label: "Checked In", value: "checked_in" }, { label: "Status", value: "status" },
    ]);
    sendCsv(ctx.res, "room-report.csv", csv);
  });

  // ---------------------------------------------------------------- KYC (restricted)
  function kycReportRows() {
    return all("SELECT * FROM guests ORDER BY full_name").map((g) => ({
      name: g.full_name, kyc_status: g.kyc_status, submitted: g.kyc_submitted_at || "", aadhaar: maskAadhaar(g.aadhaar_number),
    }));
  }

  router.get("/reports/kyc", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!KYC_VIEW_ROLES.includes(user.role)) return redirect(ctx.res, "/reports");
    const rows = kycReportRows();
    const content = `
      <div class="page-head"><h1>KYC Report</h1><a href="/reports/kyc.csv" class="btn btn-secondary btn-sm">Export CSV</a></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Guest</th><th>KYC Status</th><th>Submitted</th><th>Aadhaar</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.kyc_status)}</td><td>${r.submitted ? formatDate(r.submitted) : "—"}</td><td>${r.aadhaar}</td></tr>`).join("") || `<tr><td colspan="4">${emptyState("No guests.")}</td></tr>`}</tbody></table></div></div>
    `;
    sendHtml(ctx.res, page({ user, active: "reports", title: "KYC Report", content }));
  });

  router.get("/reports/kyc.csv", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!KYC_VIEW_ROLES.includes(user.role)) return redirect(ctx.res, "/reports");
    const csv = toCsv(kycReportRows(), [
      { label: "Guest", value: "name" }, { label: "KYC Status", value: "kyc_status" },
      { label: "Submitted", value: "submitted" }, { label: "Aadhaar (masked)", value: "aadhaar" },
    ]);
    sendCsv(ctx.res, "kyc-report.csv", csv);
  });
}
