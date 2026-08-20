import { get, run } from "../lib/db.js";
import { sendHtml, redirect } from "../lib/router.js";
import { authPage, icon, badge } from "../lib/render.js";
import { escapeHtml, formatDate, maskAadhaar } from "../lib/format.js";
import { GUEST_STATUSES } from "../lib/constants.js";

function kycVariant(status) {
  if (status === "Verified") return "good";
  if (status === "Submitted") return "gold";
  if (status === "Rejected") return "critical";
  return "warning";
}

export function registerGuestPortalRoutes(router) {
  router.get("/guest/secure/:token", (ctx) => {
    const g = get("SELECT * FROM guests WHERE portal_token = ?", [ctx.params.token]);
    if (!g) {
      return sendHtml(ctx.res, authPage({ title: "Not found", content: `<div class="guest-wrap"><div class="empty-state">This link is invalid or has expired. Please ask the family for a new one.</div></div>` }));
    }
    const room = get(
      `SELECT r.*, h.name as hotel_name FROM room_allocations ra JOIN rooms r ON r.id=ra.room_id JOIN hotels h ON h.id=r.hotel_id WHERE ra.guest_id = ? AND ra.checked_out_at IS NULL`,
      [g.id]
    );
    const saved = ctx.query.saved;

    const content = `
    <div class="guest-wrap">
      <div class="guest-header">
        <h1>Complete Your Wedding Stay Details</h1>
        <p>Hi ${escapeHtml(g.full_name.split(" ")[0])}, please confirm your details below.</p>
      </div>
      <div class="status-strip">${badge(g.status, "gold")} ${badge("KYC: " + g.kyc_status, kycVariant(g.kyc_status))}</div>
      ${saved ? `<div class="flash success" style="margin-bottom:16px;">Thank you — your details were saved.</div>` : ""}

      ${room ? `<div class="card" style="margin-bottom:18px;">
        <h2>Your room</h2>
        <p>You're allocated to <strong>${escapeHtml(room.room_number)}</strong> at <strong>${escapeHtml(room.hotel_name)}</strong> (${escapeHtml(room.room_type)}).</p>
      </div>` : `<div class="card" style="margin-bottom:18px;"><p class="small muted">Your room hasn't been allocated yet — it will appear here once the family assigns one.</p></div>`}

      <div class="card">
        <form method="POST" action="/guest/secure/${ctx.params.token}">
          <div class="section-title" style="margin-top:0;">Your details</div>
          <div class="field-row">
            <div class="field"><label>Full name</label><input type="text" name="full_name" value="${escapeHtml(g.full_name)}" required /></div>
            <div class="field"><label>Mobile</label><input type="tel" name="mobile" value="${escapeHtml(g.mobile || "")}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Accompanying guests</label><input type="number" name="accompanying_count" value="${g.accompanying_count || 0}" /></div>
            <div class="field"><label>Are you attending?</label><select name="status">
              ${GUEST_STATUSES.filter((s) => ["Invited", "Confirmed", "Not Coming"].includes(s)).map((s) => `<option ${g.status === s ? "selected" : ""}>${s}</option>`).join("")}
            </select></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Arrival date</label><input type="date" name="arrival_date" value="${escapeHtml(g.arrival_date || "")}" /></div>
            <div class="field"><label>Arrival time</label><input type="time" name="arrival_time" value="${escapeHtml(g.arrival_time || "")}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Departure date</label><input type="date" name="departure_date" value="${escapeHtml(g.departure_date || "")}" /></div>
            <div class="field"><label>Departure time</label><input type="time" name="departure_time" value="${escapeHtml(g.departure_time || "")}" /></div>
          </div>
          <div class="field"><label>Travel details</label><input type="text" name="travel_details" value="${escapeHtml(g.travel_details || "")}" placeholder="Flight / train number" /></div>
          <div class="field-row">
            <div class="field"><label>Food preference</label><input type="text" name="food_preference" value="${escapeHtml(g.food_preference || "")}" /></div>
            <div class="field"><label>Special requirements</label><input type="text" name="special_requirements" value="${escapeHtml(g.special_requirements || "")}" /></div>
          </div>

          <div class="section-title">Identity verification (KYC)</div>
          <div class="consent-box">
            By submitting, you consent to sharing your Aadhaar number with the organizing family solely for hotel
            check-in and room allocation purposes. It is stored securely, shown only to authorized organizers, and
            never displayed publicly. Currently submitted: <strong>${maskAadhaar(g.aadhaar_number)}</strong>.
          </div>
          <div class="field-row">
            <div class="field"><label>Aadhaar number</label><input type="text" name="aadhaar_number" placeholder="XXXX XXXX XXXX" maxlength="14" /></div>
            <div class="field"><label>Date of birth</label><input type="date" name="aadhaar_dob" value="${escapeHtml(g.aadhaar_dob || "")}" /></div>
          </div>
          <label class="checkbox-row" style="margin-bottom:16px;"><input type="checkbox" name="consent" value="1" ${g.kyc_consent ? "checked" : ""} /> I consent to sharing my details and Aadhaar number as described above.</label>

          <button type="submit" class="btn btn-lg btn-block">Save my details</button>
        </form>
      </div>
      <div class="footer-note">Having trouble? Contact the family directly.</div>
    </div>`;
    sendHtml(ctx.res, authPage({ title: "Guest Portal", content }));
  });

  router.post("/guest/secure/:token", (ctx) => {
    const g = get("SELECT * FROM guests WHERE portal_token = ?", [ctx.params.token]);
    if (!g) return redirect(ctx.res, "/guest/secure/" + ctx.params.token);
    const b = ctx.body;

    const aadhaarProvided = b.aadhaar_number && b.aadhaar_number.replace(/\D/g, "").length >= 12;
    const newKycStatus = aadhaarProvided ? "Submitted" : g.kyc_status;

    run(
      `UPDATE guests SET full_name=?, mobile=?, accompanying_count=?, status=?, arrival_date=?, arrival_time=?, departure_date=?, departure_time=?, travel_details=?, food_preference=?, special_requirements=?,
       aadhaar_number = CASE WHEN ? != '' THEN ? ELSE aadhaar_number END,
       aadhaar_dob = ?, kyc_consent=?, kyc_status=?, kyc_submitted_at = CASE WHEN ? != '' THEN datetime('now') ELSE kyc_submitted_at END
       WHERE id=?`,
      [
        b.full_name, b.mobile, Number(b.accompanying_count) || 0, b.status, b.arrival_date, b.arrival_time,
        b.departure_date, b.departure_time, b.travel_details, b.food_preference, b.special_requirements,
        b.aadhaar_number || "", b.aadhaar_number || "",
        b.aadhaar_dob, b.consent ? 1 : 0, newKycStatus, b.aadhaar_number || "",
        g.id,
      ]
    );
    redirect(ctx.res, `/guest/secure/${ctx.params.token}?saved=1`);
  });
}
