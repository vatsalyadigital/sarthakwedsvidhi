export const VENDOR_CATEGORIES = [
  "Venue", "Hotel", "Catering", "Decoration", "Florist", "Photography",
  "Videography", "Makeup", "Mehendi", "DJ", "Music", "Entertainment",
  "Choreographer", "Wedding Planner", "Invitations", "Gifts", "Transport",
  "Security", "Generator", "Lighting", "Furniture", "Tent", "Priest",
  "Pandit", "Clothing", "Jewellery", "Accommodation", "Other",
];

export const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"];

export const PAYMENT_STATUSES = ["Unpaid", "Partially Paid", "Paid"];

export const GUEST_STATUSES = ["Invited", "Confirmed", "Not Coming", "Arrived", "Checked In", "Checked Out"];

export const KYC_STATUSES = ["Pending", "Submitted", "Verified", "Rejected"];

export const ROOM_TYPES = ["Single", "Double", "Twin", "Triple", "Suite", "Family"];

// Sensible defaults used when bulk-generating rooms for a hotel.
export const ROOM_TYPE_DEFAULTS = {
  Single: { max_occupancy: 1, rate: 6000 },
  Double: { max_occupancy: 2, rate: 9000 },
  Twin: { max_occupancy: 2, rate: 9000 },
  Triple: { max_occupancy: 3, rate: 12000 },
  Suite: { max_occupancy: 4, rate: 18000 },
  Family: { max_occupancy: 5, rate: 15000 },
};

export const ROOM_STATUSES = ["Available", "Reserved", "Occupied", "Cleaning", "Blocked"];

export const DOCUMENT_TYPES = [
  "Quotation", "Invoice", "Contract", "Receipt", "Hotel Agreement",
  "Payment Receipt", "KYC Record", "Other",
];

export const ROLES = ["SUPER_ADMIN", "FINANCE", "GUEST_MANAGER", "VENDOR_MANAGER", "VIEWER"];

export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  FINANCE: "Finance",
  GUEST_MANAGER: "Guest Manager",
  VENDOR_MANAGER: "Vendor Manager",
  VIEWER: "Viewer",
};

// Which roles may write (create/update/delete) in which functional areas.
// SUPER_ADMIN can always do everything.
export const ROLE_PERMISSIONS = {
  vendors: ["SUPER_ADMIN", "VENDOR_MANAGER"],
  payments: ["SUPER_ADMIN", "FINANCE", "VENDOR_MANAGER"],
  budget: ["SUPER_ADMIN", "FINANCE"],
  guests: ["SUPER_ADMIN", "GUEST_MANAGER"],
  kyc: ["SUPER_ADMIN", "GUEST_MANAGER"],
  rooms: ["SUPER_ADMIN", "GUEST_MANAGER"],
  functions: ["SUPER_ADMIN", "FINANCE", "GUEST_MANAGER", "VENDOR_MANAGER"],
  documents: ["SUPER_ADMIN", "FINANCE", "GUEST_MANAGER", "VENDOR_MANAGER"],
  wedding: ["SUPER_ADMIN"],
  settings: ["SUPER_ADMIN"],
};

export function canWrite(role, area) {
  if (role === "SUPER_ADMIN") return true;
  const allowed = ROLE_PERMISSIONS[area];
  return !!allowed && allowed.includes(role);
}
