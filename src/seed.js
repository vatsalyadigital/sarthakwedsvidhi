import crypto from "node:crypto";
import { db, run } from "./lib/db.js";
import { hashPassword } from "./lib/auth.js";

function randomPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

console.log("Seeding Wedding ERP — creating admin accounts (no demo data)...");

db.exec("BEGIN");
try {
  // ------------------------------------------------------------- Wipe any existing data (idempotent re-seed)
  for (const t of [
    "audit_logs", "documents", "room_allocations", "rooms", "hotels",
    "guests", "guest_groups", "expenses", "vendor_payments",
    "vendor_quote_items", "vendor_quotes", "vendor_functions", "vendors",
    "functions", "users",
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec(`DELETE FROM sqlite_sequence`);

  // ------------------------------------------------------------- Super admins
  const admins = [
    { name: "Sarthak Kalra", email: "skalra987@gmail.com" },
    { name: "Niharika Kaushal", email: "niharika.kaushal@vatsalyadigital.com" },
    { name: "Abhinav Kalra", email: "abhinavkal@gmail.com" },
  ].map((a) => ({ ...a, password: randomPassword() }));

  for (const a of admins) {
    run("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)", [a.name, a.email, hashPassword(a.password), "SUPER_ADMIN"]);
  }

  // ------------------------------------------------------------- Blank wedding details (fill in via the app)
  run(
    `UPDATE wedding SET wedding_name=?, bride_name=?, groom_name=?, wedding_date=?, venue=?, city=?, planner_name=?, contact_numbers=?, total_budget=?, expected_guests=?, expected_rooms=?, notes=? WHERE id=1`,
    ["", "", "", "", "", "", "", "", 0, 0, 0, ""]
  );

  db.exec("COMMIT");
  console.log("Seed complete.\n");
  console.log("Super admin logins (temporary passwords — change these immediately after signing in):");
  for (const a of admins) console.log(`  ${a.email.padEnd(38)} ${a.password}`);
} catch (err) {
  db.exec("ROLLBACK");
  console.error("Seed failed:", err);
  process.exit(1);
}
