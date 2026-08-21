import { db, all, tx } from "./db.js";

const TABLES = [
  "users", "wedding", "functions", "budget_categories", "vendors",
  "vendor_functions", "vendor_quotes", "vendor_quote_items", "vendor_payments",
  "guest_groups", "guests", "hotels", "rooms", "room_allocations",
  "documents", "audit_logs",
];

export function exportAllData() {
  const tables = {};
  for (const table of TABLES) {
    tables[table] = all(`SELECT * FROM ${table}`);
  }
  return { version: 1, exportedAt: new Date().toISOString(), tables };
}

export function importAllData(payload) {
  if (!payload || typeof payload !== "object" || !payload.tables) {
    throw new Error("Invalid backup file: missing 'tables'.");
  }
  // FK pragma can't change inside a transaction, so it wraps the tx rather than living in it.
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    tx(() => {
      for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
      for (const table of TABLES) {
        const rows = payload.tables[table];
        if (!Array.isArray(rows) || !rows.length) continue;
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => "?").join(",");
        const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`);
        for (const row of rows) {
          stmt.run(...columns.map((c) => (row[c] === undefined ? null : row[c])));
        }
      }
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}
