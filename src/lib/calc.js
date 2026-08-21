import { all, get } from "./db.js";

export function vendorFinalContractAmount(vendor) {
  const base = Number(vendor.contract_value) || 0;
  const discount = Number(vendor.discount_amount) || 0;
  const taxPct = Number(vendor.tax_percent) || 0;
  const afterDiscount = base - discount;
  const tax = afterDiscount * (taxPct / 100);
  return Math.max(0, afterDiscount + tax);
}

export function vendorTotalPaid(vendorId) {
  const row = get("SELECT COALESCE(SUM(amount),0) as total FROM vendor_payments WHERE vendor_id = ?", [vendorId]);
  return row ? Number(row.total) : 0;
}

export function vendorPaymentStatus(finalAmount, totalPaid) {
  if (finalAmount <= 0 && totalPaid <= 0) return "Unpaid";
  if (totalPaid <= 0) return "Unpaid";
  if (totalPaid > finalAmount) return "Overpaid";
  if (totalPaid >= finalAmount) return "Fully Paid";
  return "Partially Paid";
}

export function vendorSummary(vendor) {
  const finalAmount = vendorFinalContractAmount(vendor);
  const totalPaid = vendorTotalPaid(vendor.id);
  const outstanding = Math.max(0, finalAmount - totalPaid);
  const status = vendorPaymentStatus(finalAmount, totalPaid);
  return { finalAmount, totalPaid, outstanding, status };
}

export function quoteItemTotal(item) {
  const qty = Number(item.quantity) || 0;
  const rate = Number(item.rate) || 0;
  const discount = Number(item.discount) || 0;
  const taxPct = Number(item.tax_percent) || 0;
  const line = qty * rate - discount;
  return Math.max(0, line + line * (taxPct / 100));
}

export function quoteTotal(items) {
  return items.reduce((sum, i) => sum + quoteItemTotal(i), 0);
}

export function functionEstimated(functionId) {
  const vendors = all(
    `SELECT v.* FROM vendors v JOIN vendor_functions vf ON vf.vendor_id = v.id WHERE vf.function_id = ?`,
    [functionId]
  );
  return vendors.reduce((sum, v) => sum + vendorFinalContractAmount(v), 0);
}

export function categoryEstimated(categoryName) {
  const vendors = all("SELECT * FROM vendors WHERE category = ?", [categoryName]);
  return vendors.reduce((sum, v) => sum + vendorFinalContractAmount(v), 0);
}

export function roomOccupancy(roomId) {
  const rows = all(
    `SELECT ra.*, g.full_name FROM room_allocations ra
     JOIN guests g ON g.id = ra.guest_id
     WHERE ra.room_id = ? AND ra.checked_out_at IS NULL
     ORDER BY ra.created_at`,
    [roomId]
  );
  return rows;
}

export function dashboardTotals() {
  const wedding = get("SELECT * FROM wedding WHERE id = 1");
  const totalBudget = Number(wedding?.total_budget) || 0;

  const vendors = all("SELECT * FROM vendors");
  let totalContract = 0;
  let totalVendorPaid = 0;
  let totalVendorOutstanding = 0;
  for (const v of vendors) {
    const s = vendorSummary(v);
    totalContract += s.finalAmount;
    totalVendorPaid += s.totalPaid;
    totalVendorOutstanding += s.outstanding;
  }

  const totalPaid = totalVendorPaid;
  const totalEstimated = totalContract; // sum of vendor contract final amounts
  const totalOutstanding = totalVendorOutstanding;

  const guestCount = get("SELECT COUNT(*) as c FROM guests").c;
  const vendorCount = get("SELECT COUNT(*) as c FROM vendors").c;

  const roomsAllocated = get(
    `SELECT COUNT(DISTINCT room_id) as c FROM room_allocations WHERE checked_out_at IS NULL`
  ).c;
  const totalRooms = get("SELECT COUNT(*) as c FROM rooms").c;
  const roomsPending = Math.max(0, totalRooms - roomsAllocated);

  return {
    wedding,
    totalBudget,
    totalEstimated,
    totalPaid,
    totalOutstanding,
    vendorCount,
    guestCount,
    roomsAllocated,
    roomsPending,
    totalRooms,
  };
}
