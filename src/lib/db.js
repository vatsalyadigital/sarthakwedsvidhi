import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets you point the database at a mounted persistent volume in production
// (Render/Railway/Fly.io disks all work this way) — defaults to ./data for local dev.
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "wedding.db");
export const db = new DatabaseSync(dbPath);

db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'VIEWER',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wedding (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  wedding_name TEXT,
  bride_name TEXT,
  groom_name TEXT,
  wedding_date TEXT,
  venue TEXT,
  city TEXT,
  planner_name TEXT,
  contact_numbers TEXT,
  total_budget REAL DEFAULT 0,
  expected_guests INTEGER DEFAULT 0,
  expected_rooms INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS functions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT,
  start_time TEXT,
  end_time TEXT,
  venue TEXT,
  expected_guests INTEGER DEFAULT 0,
  budget REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  contact_person TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  gst_number TEXT,
  pan_number TEXT,
  bank_details TEXT,
  payment_terms TEXT,
  notes TEXT,
  contract_value REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  tax_percent REAL DEFAULT 0,
  contract_status TEXT DEFAULT 'Draft',
  contract_signed_date TEXT,
  next_payment_due_date TEXT,
  next_payment_amount REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendor_functions (
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  function_id INTEGER NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  PRIMARY KEY (vendor_id, function_id)
);

CREATE TABLE IF NOT EXISTS vendor_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  quote_number TEXT,
  quote_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendor_quote_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES vendor_quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax_percent REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vendor_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL,
  mode TEXT NOT NULL DEFAULT 'Bank Transfer',
  transaction_ref TEXT,
  paid_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guest_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  gender TEXT,
  age INTEGER,
  mobile TEXT,
  whatsapp TEXT,
  email TEXT,
  group_id INTEGER REFERENCES guest_groups(id) ON DELETE SET NULL,
  relationship TEXT,
  accompanying_count INTEGER DEFAULT 0,
  arrival_date TEXT,
  arrival_time TEXT,
  departure_date TEXT,
  departure_time TEXT,
  travel_details TEXT,
  room_required INTEGER DEFAULT 1,
  bed_requirement TEXT,
  food_preference TEXT,
  special_requirements TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Invited',
  portal_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hotels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  total_rooms INTEGER DEFAULT 0,
  check_in_time TEXT DEFAULT '14:00',
  check_out_time TEXT DEFAULT '11:00'
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  room_type TEXT NOT NULL DEFAULT 'Superior',
  floor TEXT,
  max_occupancy INTEGER NOT NULL DEFAULT 3,
  bed_configuration TEXT,
  rate REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Available'
);

CREATE TABLE IF NOT EXISTS room_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  checked_in_at TEXT,
  checked_out_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL DEFAULT 'Other',
  linked_type TEXT,
  linked_id INTEGER,
  name TEXT NOT NULL,
  external_link TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_guests_group ON guests(group_id);
CREATE INDEX IF NOT EXISTS idx_rooms_hotel ON rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_allocations_room ON room_allocations(room_id);
CREATE INDEX IF NOT EXISTS idx_allocations_guest ON room_allocations(guest_id);
CREATE INDEX IF NOT EXISTS idx_documents_link ON documents(linked_type, linked_id);
`);

if (!db.prepare("SELECT id FROM wedding WHERE id = 1").get()) {
  db.prepare(
    `INSERT INTO wedding (id, wedding_name, bride_name, groom_name, wedding_date, venue, city, planner_name, contact_numbers, total_budget, expected_guests, expected_rooms, notes)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "Niharika & Family Wedding",
    "Niharika",
    "",
    "2026-12-12",
    "",
    "",
    "",
    "",
    5000000,
    300,
    30,
    ""
  );
}

// ---------------------------------------------------------------------------
// Small query helpers
// ---------------------------------------------------------------------------
// node:sqlite's bind() rejects `undefined` outright (it wants null for empty values).
// Since HTML form bodies routinely omit optional fields, normalize here once instead
// of scattering `?? null` across every route.
function normalize(params) {
  return params.map((p) => (p === undefined ? null : p));
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...normalize(params));
}
export function get(sql, params = []) {
  return db.prepare(sql).get(...normalize(params));
}
export function all(sql, params = []) {
  return db.prepare(sql).all(...normalize(params));
}
export function tx(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
