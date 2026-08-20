import crypto from "node:crypto";
import { db, run, get, all } from "./lib/db.js";
import { hashPassword } from "./lib/auth.js";

function token() {
  return crypto.randomBytes(16).toString("hex");
}

console.log("Seeding Wedding ERP demo data...");

db.exec("BEGIN");
try {
  // ------------------------------------------------------------- Wipe existing demo data (idempotent re-seed)
  for (const t of [
    "audit_logs", "documents", "room_allocations", "rooms", "hotels",
    "guests", "guest_groups", "expenses", "vendor_payments",
    "vendor_quote_items", "vendor_quotes", "vendor_functions", "vendors",
    "functions", "users",
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec(`DELETE FROM sqlite_sequence`);

  // ------------------------------------------------------------- Users (one per role)
  const users = [
    { name: "Niharika Kaushal", email: "admin@wedding.test", password: "password123", role: "SUPER_ADMIN" },
    { name: "Rohit Kaushal", email: "finance@wedding.test", password: "password123", role: "FINANCE" },
    { name: "Simran Kaushal", email: "guests@wedding.test", password: "password123", role: "GUEST_MANAGER" },
    { name: "Aman Vendor", email: "vendors@wedding.test", password: "password123", role: "VENDOR_MANAGER" },
    { name: "Family Viewer", email: "viewer@wedding.test", password: "password123", role: "VIEWER" },
  ];
  for (const u of users) {
    run("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)", [u.name, u.email, hashPassword(u.password), u.role]);
  }

  // ------------------------------------------------------------- Wedding details
  run(
    `UPDATE wedding SET wedding_name=?, bride_name=?, groom_name=?, wedding_date=?, venue=?, city=?, planner_name=?, contact_numbers=?, total_budget=?, expected_guests=?, expected_rooms=?, notes=? WHERE id=1`,
    [
      "Niharika & Aditya's Wedding", "Niharika", "Aditya", "2026-12-12",
      "The Leela Palace Grounds", "Udaipur", "Vatsalya Events & Weddings", "+91 98765 43210, +91 91234 56789",
      5000000, 300, 30, "Winter wedding — three days of functions across two venues.",
    ]
  );

  // ------------------------------------------------------------- Functions
  const functions = [
    { name: "Engagement", date: "2026-12-08", start_time: "18:00", end_time: "21:00", venue: "Kaushal Residence, Delhi", expected_guests: 80, budget: 400000 },
    { name: "Mehendi", date: "2026-12-10", start_time: "16:00", end_time: "21:00", venue: "The Leela Palace Lawns", expected_guests: 180, budget: 900000 },
    { name: "Haldi", date: "2026-12-11", start_time: "10:00", end_time: "13:00", venue: "The Leela Palace Poolside", expected_guests: 150, budget: 350000 },
    { name: "Sangeet", date: "2026-12-11", start_time: "19:00", end_time: "23:30", venue: "The Leela Palace Banquet Hall", expected_guests: 300, budget: 1500000 },
    { name: "Wedding", date: "2026-12-12", start_time: "19:00", end_time: "23:00", venue: "The Leela Palace Grounds", expected_guests: 300, budget: 1800000 },
    { name: "Reception", date: "2026-12-13", start_time: "19:30", end_time: "23:00", venue: "Taj Aravali Grounds", expected_guests: 350, budget: 1200000 },
  ];
  const functionIds = {};
  for (const f of functions) {
    const r = run("INSERT INTO functions (name, date, start_time, end_time, venue, expected_guests, budget, notes) VALUES (?,?,?,?,?,?,?,?)", [
      f.name, f.date, f.start_time, f.end_time, f.venue, f.expected_guests, f.budget, "",
    ]);
    functionIds[f.name] = Number(r.lastInsertRowid);
  }

  // ------------------------------------------------------------- Vendors
  const vendors = [
    { name: "Shutter Studio Photography", category: "Photography", contact: "Karan Mehta", phone: "9811122233", contract: 850000, functions: ["Mehendi", "Sangeet", "Wedding", "Reception"] },
    { name: "Frame & Motion Films", category: "Videography", contact: "Priya Sen", phone: "9811122234", contract: 620000, functions: ["Wedding", "Reception"] },
    { name: "Royal Bloom Decor", category: "Decoration", contact: "Anil Kapoor Jr.", phone: "9822233344", contract: 1800000, functions: ["Sangeet", "Wedding"] },
    { name: "Petal & Vine Florists", category: "Florist", contact: "Meena Iyer", phone: "9822233345", contract: 320000, functions: ["Haldi", "Wedding"] },
    { name: "Taste of Rajasthan Caterers", category: "Catering", contact: "Suresh Rathore", phone: "9833344455", contract: 2400000, functions: ["Sangeet", "Wedding", "Reception"] },
    { name: "Glow Up Makeup Studio", category: "Makeup", contact: "Anjali Bhatt", phone: "9844455566", contract: 280000, functions: ["Mehendi", "Wedding"] },
    { name: "Mehendi by Rehana", category: "Mehendi", contact: "Rehana Sheikh", phone: "9855566677", contract: 150000, functions: ["Mehendi"] },
    { name: "DJ Nitrous Live", category: "DJ", contact: "Nitin Chopra", phone: "9866677788", contract: 400000, functions: ["Sangeet"] },
    { name: "Nakshatra Tent & Furniture", category: "Tent", contact: "Vikram Solanki", phone: "9877788899", contract: 950000, functions: ["Haldi", "Sangeet", "Wedding"] },
    { name: "Elite Fleet Transport", category: "Transport", contact: "Ramesh Yadav", phone: "9888899900", contract: 300000, functions: ["Wedding", "Reception"] },
  ];
  const vendorIds = {};
  for (const v of vendors) {
    const discount = Math.round(v.contract * 0.03);
    const taxPct = 18;
    const r = run(
      `INSERT INTO vendors (name, category, contact_person, phone, whatsapp, email, address, gst_number, pan_number, bank_details, payment_terms, notes, contract_value, discount_amount, tax_percent, contract_status, contract_signed_date, next_payment_due_date, next_payment_amount)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        v.name, v.category, v.contact, v.phone, v.phone, v.contact.toLowerCase().replace(/\s+/g, ".") + "@example.com",
        "Udaipur, Rajasthan", "08AAAAA0000A1Z5", "AAAAA0000A", "HDFC Bank · A/C 000123456789 · IFSC HDFC0000123",
        "50% advance, balance 7 days before event", "Preferred vendor from last year's cousin wedding.",
        v.contract, discount, taxPct, "Signed", "2026-09-01", "2026-11-15", Math.round(v.contract * 0.25),
      ]
    );
    const vendorId = Number(r.lastInsertRowid);
    vendorIds[v.name] = vendorId;
    for (const fname of v.functions) {
      run("INSERT OR IGNORE INTO vendor_functions (vendor_id, function_id) VALUES (?, ?)", [vendorId, functionIds[fname]]);
    }
    // one quotation with 2-3 line items per vendor
    const qr = run("INSERT INTO vendor_quotes (vendor_id, quote_number, quote_date, notes) VALUES (?,?,?,?)", [
      vendorId, "QT-" + (1000 + vendorId), "2026-08-15", "Initial quotation",
    ]);
    const quoteId = Number(qr.lastInsertRowid);
    run("INSERT INTO vendor_quote_items (quote_id, description, quantity, rate, discount, tax_percent) VALUES (?,?,?,?,?,?)", [
      quoteId, "Base package", 1, Math.round(v.contract * 0.8), discount, taxPct,
    ]);
    run("INSERT INTO vendor_quote_items (quote_id, description, quantity, rate, discount, tax_percent) VALUES (?,?,?,?,?,?)", [
      quoteId, "Add-ons & extra hours", 1, Math.round(v.contract * 0.2), 0, taxPct,
    ]);
  }

  // ------------------------------------------------------------- Vendor payments (10 total)
  const paymentPlan = [
    ["Shutter Studio Photography", "2026-09-05", 400000, "Bank Transfer", "TXN10001"],
    ["Shutter Studio Photography", "2026-11-20", 200000, "UPI", "TXN10002"],
    ["Royal Bloom Decor", "2026-09-10", 900000, "Bank Transfer", "TXN10003"],
    ["Taste of Rajasthan Caterers", "2026-09-15", 1200000, "Cheque", "TXN10004"],
    ["Taste of Rajasthan Caterers", "2026-11-01", 600000, "Bank Transfer", "TXN10005"],
    ["Glow Up Makeup Studio", "2026-09-20", 140000, "UPI", "TXN10006"],
    ["Mehendi by Rehana", "2026-09-25", 150000, "Cash", "TXN10007"],
    ["DJ Nitrous Live", "2026-10-01", 200000, "UPI", "TXN10008"],
    ["Nakshatra Tent & Furniture", "2026-10-05", 475000, "Bank Transfer", "TXN10009"],
    ["Elite Fleet Transport", "2026-10-10", 150000, "UPI", "TXN10010"],
  ];
  for (const [vname, date, amount, mode, ref] of paymentPlan) {
    run("INSERT INTO vendor_payments (vendor_id, payment_date, amount, mode, transaction_ref, paid_by, notes) VALUES (?,?,?,?,?,?,?)", [
      vendorIds[vname], date, amount, mode, ref, "Niharika Kaushal", "",
    ]);
  }

  // ------------------------------------------------------------- Expense categories budgets
  const categoryBudgets = {
    Food: [2500000, 2400000], Decoration: [1800000, 1800000], Venue: [1200000, 1200000],
    Accommodation: [900000, 900000], Transport: [350000, 300000], Photography: [900000, 850000],
    Makeup: [300000, 280000], Clothing: [600000, 550000], Gifts: [250000, 200000],
    Jewellery: [800000, 750000], Entertainment: [450000, 400000], Invitations: [120000, 100000],
    Miscellaneous: [200000, 150000],
  };
  for (const [name, [budget, estimated]] of Object.entries(categoryBudgets)) {
    run("UPDATE expense_categories SET budget=?, estimated=? WHERE name=?", [budget, estimated, name]);
  }

  // ------------------------------------------------------------- Expenses (20)
  const expenseRows = [
    ["2026-08-20", "Photography", "Shutter Studio Photography", "Sangeet", "Advance for extra drone coverage", 60000, "Paid"],
    ["2026-08-22", "Decoration", "Royal Bloom Decor", "Wedding", "Mandap floral upgrade", 220000, "Partially Paid"],
    ["2026-08-25", "Food", "Taste of Rajasthan Caterers", "Sangeet", "Live counter add-ons", 180000, "Paid"],
    ["2026-08-28", "Venue", null, "Wedding", "Venue booking deposit — Leela Palace Grounds", 500000, "Paid"],
    ["2026-09-01", "Clothing", null, null, "Bridal lehenga — designer boutique", 380000, "Paid"],
    ["2026-09-03", "Clothing", null, null, "Groom's sherwani set", 145000, "Paid"],
    ["2026-09-05", "Jewellery", null, null, "Bridal jewellery set rental + insurance", 210000, "Paid"],
    ["2026-09-08", "Invitations", null, null, "Boxed invitations — 300 sets", 95000, "Paid"],
    ["2026-09-10", "Gifts", null, null, "Guest return gift hampers", 140000, "Unpaid"],
    ["2026-09-12", "Makeup", "Glow Up Makeup Studio", "Wedding", "Bridal trial session", 25000, "Paid"],
    ["2026-09-15", "Accommodation", null, null, "Hotel block booking advance", 450000, "Paid"],
    ["2026-09-18", "Transport", "Elite Fleet Transport", "Wedding", "Guest shuttle buses (5 days)", 180000, "Partially Paid"],
    ["2026-09-20", "Entertainment", "DJ Nitrous Live", "Sangeet", "Sound & light rig upgrade", 90000, "Paid"],
    ["2026-09-22", "Miscellaneous", null, null, "Mehendi favors & welcome kits", 65000, "Unpaid"],
    ["2026-09-25", "Decoration", "Nakshatra Tent & Furniture", "Haldi", "Marigold haldi stage setup", 120000, "Paid"],
    ["2026-09-28", "Food", "Taste of Rajasthan Caterers", "Reception", "Dessert counter upgrade", 160000, "Unpaid"],
    ["2026-10-01", "Photography", "Frame & Motion Films", "Wedding", "Cinematic highlight reel add-on", 110000, "Partially Paid"],
    ["2026-10-03", "Venue", null, "Reception", "Taj Aravali Grounds booking", 700000, "Paid"],
    ["2026-10-05", "Miscellaneous", null, null, "Priest & puja samagri", 45000, "Paid"],
    ["2026-10-08", "Jewellery", null, null, "Groom's accessories", 55000, "Unpaid"],
  ];
  for (const [date, category, vname, fname, desc, amount, status] of expenseRows) {
    run(
      "INSERT INTO expenses (date, category, vendor_id, function_id, description, amount, tax, payment_status, payment_method, paid_by, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [date, category, vname ? vendorIds[vname] : null, fname ? functionIds[fname] : null, desc, amount, Math.round(amount * 0.05), status, "Bank Transfer", "Niharika Kaushal", ""]
    );
  }

  // ------------------------------------------------------------- Guest groups (families)
  const familyNames = ["Kaushal Family", "Mehra Family", "Sharma Family", "Iyer Family", "Bhatt Family"];
  const groupIds = {};
  for (const name of familyNames) {
    const r = run("INSERT INTO guest_groups (name, notes) VALUES (?, ?)", [name, ""]);
    groupIds[name] = Number(r.lastInsertRowid);
  }

  // ------------------------------------------------------------- Hotels + Rooms (3 hotels, 30 rooms)
  const hotels = [
    { name: "The Leela Palace", address: "Lake Pichola Road, Udaipur", contact_person: "Front Desk Manager", contact_phone: "0294-2701234", total_rooms: 14, roomTypes: ["Deluxe", "Suite"] },
    { name: "Taj Aravali Resort", address: "Airport Road, Udaipur", contact_person: "Reservations", contact_phone: "0294-2705678", total_rooms: 10, roomTypes: ["Standard", "Deluxe"] },
    { name: "Fateh Niwas Heritage", address: "Old City, Udaipur", contact_person: "Manager Desk", contact_phone: "0294-2709999", total_rooms: 6, roomTypes: ["Family", "Suite"] },
  ];
  const roomTypeMap = { Deluxe: "Double", Suite: "Suite", Standard: "Single", Family: "Family" };
  const roomIds = [];
  for (const h of hotels) {
    const r = run("INSERT INTO hotels (name, address, contact_person, contact_phone, total_rooms, check_in_time, check_out_time) VALUES (?,?,?,?,?,?,?)", [
      h.name, h.address, h.contact_person, h.contact_phone, h.total_rooms, "14:00", "11:00",
    ]);
    const hotelId = Number(r.lastInsertRowid);
    for (let i = 1; i <= h.total_rooms; i++) {
      const roomType = roomTypeMap[h.roomTypes[i % h.roomTypes.length]];
      const floor = String(Math.ceil(i / 5));
      const maxOcc = roomType === "Suite" ? 4 : roomType === "Family" ? 5 : roomType === "Single" ? 1 : 2;
      const rate = roomType === "Suite" ? 18000 : roomType === "Family" ? 15000 : roomType === "Single" ? 6000 : 9000;
      const rr = run("INSERT INTO rooms (hotel_id, room_number, room_type, floor, max_occupancy, bed_configuration, rate, status) VALUES (?,?,?,?,?,?,?, 'Available')", [
        hotelId, `${h.name[0]}${100 + i}`, roomType, floor, maxOcc, maxOcc > 2 ? "2 double beds" : "1 king bed", rate,
      ]);
      roomIds.push(Number(rr.lastInsertRowid));
    }
  }

  // ------------------------------------------------------------- Guests (30)
  const firstNames = ["Rohan", "Ishita", "Aarav", "Diya", "Kabir", "Ananya", "Vivaan", "Myra", "Reyansh", "Saanvi", "Aditi", "Yash", "Neha", "Arjun", "Kavya", "Rahul", "Pooja", "Manish", "Ritu", "Sanjay", "Deepika", "Karan", "Tanya", "Nikhil", "Shreya", "Varun", "Priyanka", "Amit", "Sneha", "Vikas"];
  const lastNamesByFamily = { "Kaushal Family": "Kaushal", "Mehra Family": "Mehra", "Sharma Family": "Sharma", "Iyer Family": "Iyer", "Bhatt Family": "Bhatt" };
  const relationships = ["Cousin", "Uncle", "Aunt", "Friend", "Sibling", "Grandparent", "Colleague"];
  const foodPrefs = ["Vegetarian", "Non-Vegetarian", "Jain", "Vegan"];
  const statuses = ["Invited", "Confirmed", "Confirmed", "Confirmed", "Invited", "Not Coming"];

  let gi = 0;
  const guestIds = [];
  for (const family of familyNames) {
    const count = 6; // 5 families * 6 = 30
    for (let i = 0; i < count; i++) {
      const first = firstNames[gi % firstNames.length];
      const last = lastNamesByFamily[family];
      const status = statuses[gi % statuses.length];
      const kyc = ["Pending", "Submitted", "Verified", "Pending", "Rejected"][gi % 5];
      const arrival = ["2026-12-09", "2026-12-10", "2026-12-11"][gi % 3];
      const departure = "2026-12-14";
      const r = run(
        `INSERT INTO guests (full_name, gender, age, mobile, whatsapp, email, group_id, relationship, accompanying_count, arrival_date, arrival_time, departure_date, departure_time, travel_details, room_required, bed_requirement, food_preference, special_requirements, notes, status, portal_token, kyc_status, aadhaar_number, aadhaar_dob, kyc_consent, kyc_submitted_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          `${first} ${last}`, gi % 2 === 0 ? "Male" : "Female", 20 + (gi % 40), `9${700000000 + gi * 137}`, `9${700000000 + gi * 137}`,
          `${first.toLowerCase()}.${last.toLowerCase()}@example.com`, groupIds[family], relationships[gi % relationships.length],
          gi % 3, arrival, "14:00", departure, "11:00", gi % 4 === 0 ? "Flight AI-202" : "By road",
          status !== "Not Coming" ? 1 : 0, gi % 3 === 0 ? "1 extra mattress" : "", foodPrefs[gi % foodPrefs.length],
          gi % 7 === 0 ? "Wheelchair access needed" : "", "", status, token(), kyc,
          kyc !== "Pending" ? `${100000000000 + gi}` : null, kyc !== "Pending" ? "1990-01-01" : null, kyc !== "Pending" ? 1 : 0,
          kyc !== "Pending" ? "2026-08-01 10:00:00" : null,
        ]
      );
      guestIds.push(Number(r.lastInsertRowid));
      gi++;
    }
  }

  // ------------------------------------------------------------- Room allocations (allocate ~18 of 30 guests)
  let roomCursor = 0;
  for (let i = 0; i < guestIds.length; i += 2) {
    if (roomCursor >= roomIds.length) break;
    const roomId = roomIds[roomCursor];
    run("INSERT INTO room_allocations (room_id, guest_id, checked_in_at) VALUES (?, ?, ?)", [roomId, guestIds[i], i < 6 ? "2026-12-09 15:00:00" : null]);
    run("UPDATE rooms SET status='Occupied' WHERE id=?", [roomId]);
    roomCursor++;
  }

  // ------------------------------------------------------------- A few sample documents
  const sampleDocs = [
    ["Contract", "vendor", vendorIds["Royal Bloom Decor"], "Signed decor contract", "https://drive.google.com/sample-decor-contract"],
    ["Quotation", "vendor", vendorIds["Taste of Rajasthan Caterers"], "Catering quotation v2", "https://drive.google.com/sample-catering-quote"],
    ["Invoice", "vendor", vendorIds["Shutter Studio Photography"], "Photography invoice #1", "https://drive.google.com/sample-photo-invoice"],
  ];
  for (const [type, linkedType, linkedId, name, link] of sampleDocs) {
    run("INSERT INTO documents (doc_type, linked_type, linked_id, name, external_link, notes) VALUES (?,?,?,?,?,?)", [type, linkedType, linkedId, name, link, ""]);
  }

  db.exec("COMMIT");
  console.log("Seed complete.");
  console.log("\nDemo logins (all passwords: password123):");
  for (const u of users) console.log(`  ${u.role.padEnd(15)} ${u.email}`);
} catch (err) {
  db.exec("ROLLBACK");
  console.error("Seed failed:", err);
  process.exit(1);
}
