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

// Every room type is capped at 3 guests — see MAX_ROOM_OCCUPANCY.
export const ROOM_TYPES = ["Executive", "Superior", "Signature", "President", "Family"];
export const MAX_ROOM_OCCUPANCY = 3;

// Sensible defaults used when bulk-generating rooms for a hotel.
export const ROOM_TYPE_DEFAULTS = {
  Executive: { max_occupancy: 3 },
  Superior: { max_occupancy: 3 },
  Signature: { max_occupancy: 3 },
  President: { max_occupancy: 3 },
  Family: { max_occupancy: 3 },
};

export const ROOM_STATUSES = ["Available", "Reserved", "Occupied", "Cleaning", "Blocked"];

export const DOCUMENT_TYPES = [
  "Quotation", "Invoice", "Contract", "Receipt", "Hotel Agreement",
  "Payment Receipt", "Other",
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
