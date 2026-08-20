import { get, run } from "../lib/db.js";
import { requireUser, requireWrite } from "../lib/guard.js";
import { sendHtml, redirect } from "../lib/router.js";
import { page } from "../lib/render.js";
import { escapeHtml, formatINR } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";
import { canWrite } from "../lib/constants.js";

export function registerWeddingRoutes(router) {
  router.get("/wedding", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    const w = get("SELECT * FROM wedding WHERE id = 1");
    const canEdit = canWrite(user.role, "wedding");

    const content = `
      <div class="page-head">
        <div>
          <h1>Wedding Details</h1>
          <p class="lede">The core information every other module builds on.</p>
        </div>
      </div>
      <div class="card">
        <form method="POST" action="/wedding">
          <div class="field-row">
            <div class="field"><label>Wedding name</label><input type="text" name="wedding_name" value="${escapeHtml(w.wedding_name)}" ${canEdit ? "" : "disabled"} /></div>
            <div class="field"><label>Wedding date</label><input type="date" name="wedding_date" value="${escapeHtml(w.wedding_date)}" ${canEdit ? "" : "disabled"} /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Bride name</label><input type="text" name="bride_name" value="${escapeHtml(w.bride_name)}" ${canEdit ? "" : "disabled"} /></div>
            <div class="field"><label>Groom name</label><input type="text" name="groom_name" value="${escapeHtml(w.groom_name)}" ${canEdit ? "" : "disabled"} /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Venue</label><input type="text" name="venue" value="${escapeHtml(w.venue)}" ${canEdit ? "" : "disabled"} /></div>
            <div class="field"><label>City</label><input type="text" name="city" value="${escapeHtml(w.city)}" ${canEdit ? "" : "disabled"} /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Wedding planner</label><input type="text" name="planner_name" value="${escapeHtml(w.planner_name)}" ${canEdit ? "" : "disabled"} /></div>
            <div class="field"><label>Contact numbers</label><input type="text" name="contact_numbers" value="${escapeHtml(w.contact_numbers)}" placeholder="comma separated" ${canEdit ? "" : "disabled"} /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Total wedding budget (₹)</label><input type="number" name="total_budget" value="${w.total_budget}" ${canEdit ? "" : "disabled"} /></div>
            <div class="field"><label>Expected guests</label><input type="number" name="expected_guests" value="${w.expected_guests}" ${canEdit ? "" : "disabled"} /></div>
            <div class="field"><label>Number of hotel rooms</label><input type="number" name="expected_rooms" value="${w.expected_rooms}" ${canEdit ? "" : "disabled"} /></div>
          </div>
          <div class="field"><label>Notes</label><textarea name="notes" ${canEdit ? "" : "disabled"}>${escapeHtml(w.notes)}</textarea></div>
          ${canEdit ? `<button type="submit" class="btn">Save changes</button>` : `<p class="muted small">You have read-only access to wedding details.</p>`}
        </form>
      </div>

      <div class="section-title">Quick summary</div>
      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-label">Budget</div><div class="stat-value">${formatINR(w.total_budget)}</div></div>
        <div class="stat-tile"><div class="stat-label">Expected guests</div><div class="stat-value">${w.expected_guests || 0}</div></div>
        <div class="stat-tile"><div class="stat-label">Expected rooms</div><div class="stat-value">${w.expected_rooms || 0}</div></div>
      </div>
      <p class="muted small">Functions/events are managed on the <a href="/functions">Functions / Events</a> page.</p>
    `;
    sendHtml(ctx.res, page({ user, active: "wedding", title: "Wedding Details", content }));
  });

  router.post("/wedding", (ctx) => {
    const user = requireUser(ctx);
    if (!user) return;
    if (!requireWrite(ctx, user, "wedding", "/wedding")) return;

    const b = ctx.body;
    run(
      `UPDATE wedding SET wedding_name=?, bride_name=?, groom_name=?, wedding_date=?, venue=?, city=?, planner_name=?, contact_numbers=?, total_budget=?, expected_guests=?, expected_rooms=?, notes=? WHERE id=1`,
      [
        b.wedding_name, b.bride_name, b.groom_name, b.wedding_date, b.venue, b.city,
        b.planner_name, b.contact_numbers, Number(b.total_budget) || 0,
        Number(b.expected_guests) || 0, Number(b.expected_rooms) || 0, b.notes,
      ]
    );
    logAudit(user, "UPDATE", "wedding", 1, "Updated wedding details");
    redirect(ctx.res, "/wedding");
  });
}
