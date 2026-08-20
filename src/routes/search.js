import { all } from "../lib/db.js";
import { requireUser } from "../lib/guard.js";
import { sendHtml, sendJson } from "../lib/router.js";
import { page, emptyState } from "../lib/render.js";
import { escapeHtml, formatINR } from "../lib/format.js";

function runSearch(q) {
  const like = `%${q}%`;
  const results = [];

  all("SELECT * FROM vendors WHERE name LIKE ? OR phone LIKE ? OR contact_person LIKE ? LIMIT 8", [like, like, like]).forEach((v) =>
    results.push({ type: "Vendor", title: v.name, subtitle: v.category, href: `/vendors/${v.id}` })
  );
  all("SELECT * FROM guests WHERE full_name LIKE ? OR mobile LIKE ? LIMIT 8", [like, like]).forEach((g) =>
    results.push({ type: "Guest", title: g.full_name, subtitle: g.mobile || "", href: `/guests/${g.id}` })
  );
  all("SELECT r.*, h.name as hotel_name FROM rooms r JOIN hotels h ON h.id=r.hotel_id WHERE r.room_number LIKE ? LIMIT 8", [like]).forEach((r) =>
    results.push({ type: "Room", title: r.room_number, subtitle: r.hotel_name, href: `/rooms?hotel_id=${r.hotel_id}` })
  );
  all("SELECT * FROM expenses WHERE description LIKE ? OR CAST(id as TEXT) = ? LIMIT 8", [like, q]).forEach((e) =>
    results.push({ type: "Expense", title: e.description || `Expense #${e.id}`, subtitle: formatINR(e.amount + e.tax), href: `/expenses` })
  );
  all("SELECT p.*, v.name as vendor_name FROM vendor_payments p JOIN vendors v ON v.id=p.vendor_id WHERE CAST(p.id as TEXT) = ? OR p.transaction_ref LIKE ? LIMIT 8", [q, like]).forEach((p) =>
    results.push({ type: "Payment", title: `${p.vendor_name} — ${formatINR(p.amount)}`, subtitle: p.payment_date, href: `/vendors/${p.vendor_id}?tab=payments` })
  );
  all("SELECT * FROM functions WHERE name LIKE ? LIMIT 8", [like]).forEach((f) =>
    results.push({ type: "Function", title: f.name, subtitle: f.date || "", href: `/functions/${f.id}` })
  );

  return results;
}

export function registerSearchRoutes(router) {
  router.get("/api/search", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const q = (ctx.query.q || "").trim();
    if (q.length < 2) return sendJson(ctx.res, { results: [] });
    sendJson(ctx.res, { results: runSearch(q) });
  });

  router.get("/search", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const q = (ctx.query.q || "").trim();
    const results = q.length >= 2 ? runSearch(q) : [];

    const grouped = {};
    for (const r of results) {
      grouped[r.type] = grouped[r.type] || [];
      grouped[r.type].push(r);
    }

    const content = `
      <div class="page-head"><h1>Search results for "${escapeHtml(q)}"</h1></div>
      ${Object.keys(grouped).length
        ? Object.entries(grouped)
            .map(
              ([type, items]) => `<div class="card">
          <h2>${type}</h2>
          ${items.map((i) => `<div class="alert-row"><a href="${i.href}">${escapeHtml(i.title)}</a><span class="small muted">${escapeHtml(i.subtitle || "")}</span></div>`).join("")}
        </div>`
            )
            .join("")
        : `<div class="card">${emptyState("No matches found.")}</div>`}
    `;
    sendHtml(ctx.res, page({ user, active: "dashboard", title: "Search", content }));
  });
}
