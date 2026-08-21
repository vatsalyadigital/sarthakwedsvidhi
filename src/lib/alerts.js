import { all } from "./db.js";
import { vendorSummary, categoryEstimated } from "./calc.js";
import { formatINR, formatDate } from "./format.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function computeAlerts() {
  const alerts = [];
  const today = todayISO();
  const in7 = addDays(today, 7);
  const tomorrow = addDays(today, 1);

  // Vendor payment due within 7 days
  const dueVendors = all(
    `SELECT * FROM vendors WHERE next_payment_due_date IS NOT NULL AND next_payment_due_date != '' AND next_payment_due_date <= ? ORDER BY next_payment_due_date`,
    [in7]
  );
  for (const v of dueVendors) {
    const overdue = v.next_payment_due_date < today;
    alerts.push({
      severity: overdue ? "critical" : "warning",
      text: `${overdue ? "Overdue" : "Due"}: ${v.name} — ${formatINR(v.next_payment_amount)} on ${formatDate(v.next_payment_due_date)}`,
      href: `/vendors/${v.id}`,
    });
  }

  // Over-budget categories (estimated cost = final vendor rates in that category)
  const cats = all(`SELECT * FROM budget_categories`);
  for (const c of cats) {
    if (!c.budget) continue;
    const estimated = categoryEstimated(c.name);
    if (estimated > c.budget) {
      alerts.push({
        severity: "critical",
        text: `Over budget: ${c.name} — estimated ${formatINR(estimated)} of ${formatINR(c.budget)}`,
        href: `/budget`,
      });
    }
  }

  // Unallocated guests (room required, coming, no active allocation)
  const unallocated = all(
    `SELECT g.* FROM guests g
     WHERE g.room_required = 1 AND g.status != 'Not Coming'
     AND NOT EXISTS (SELECT 1 FROM room_allocations ra WHERE ra.guest_id = g.id AND ra.checked_out_at IS NULL)`
  );
  if (unallocated.length) {
    alerts.push({
      severity: "warning",
      text: `${unallocated.length} guest${unallocated.length === 1 ? "" : "s"} need a room allocation`,
      href: `/rooms?tab=unallocated`,
    });
  }

  // Room capacity exceeded
  const rooms = all(
    `SELECT r.*, (SELECT COUNT(*) FROM room_allocations ra WHERE ra.room_id = r.id AND ra.checked_out_at IS NULL) as occ
     FROM rooms r`
  );
  for (const r of rooms) {
    if (r.occ > r.max_occupancy) {
      alerts.push({
        severity: "critical",
        text: `Room ${r.room_number} is over capacity (${r.occ}/${r.max_occupancy})`,
        href: `/rooms`,
      });
    }
  }

  // Guests arriving tomorrow
  const arriving = all(`SELECT * FROM guests WHERE arrival_date = ?`, [tomorrow]);
  if (arriving.length) {
    alerts.push({
      severity: "info",
      text: `${arriving.length} guest${arriving.length === 1 ? "" : "s"} arriving tomorrow`,
      href: `/guests?arrival=tomorrow`,
    });
  }

  // Vendor contract missing / not finalized
  const draftVendors = all(`SELECT * FROM vendors WHERE contract_status = 'Draft' AND contract_value > 0`);
  for (const v of draftVendors) {
    alerts.push({ severity: "info", text: `Contract not finalized: ${v.name}`, href: `/vendors/${v.id}?tab=contract` });
  }

  // Invoice missing for vendors with outstanding balance
  const vendors = all(`SELECT * FROM vendors`);
  for (const v of vendors) {
    const s = vendorSummary(v);
    if (s.outstanding > 0) {
      const hasInvoice = all(`SELECT 1 FROM documents WHERE linked_type='vendor' AND linked_id=? AND doc_type='Invoice'`, [v.id]);
      if (!hasInvoice.length) {
        alerts.push({ severity: "info", text: `No invoice on file for ${v.name} (${formatINR(s.outstanding)} outstanding)`, href: `/vendors/${v.id}?tab=documents` });
      }
    }
  }

  return alerts;
}
