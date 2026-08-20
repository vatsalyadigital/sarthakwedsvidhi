import { get } from "../lib/db.js";
import { verifyPassword, setSessionCookie, clearSessionCookie, getCurrentUser } from "../lib/auth.js";
import { sendHtml, redirect } from "../lib/router.js";
import { authPage, icon } from "../lib/render.js";
import { escapeHtml } from "../lib/format.js";
import { logAudit } from "../lib/audit.js";

export function registerAuthRoutes(router) {
  router.get("/login", (ctx) => {
    const existing = getCurrentUser(ctx.req);
    if (existing) return redirect(ctx.res, "/");

    const error = ctx.query.error;
    const html = authPage({
      title: "Sign in",
      content: `
      <div class="auth-card">
        <div class="auth-mark">${icon("heart")}</div>
        <h1>Wedding Operations ERP</h1>
        <div class="lede">Sign in to manage vendors, budgets, guests and rooms.</div>
        ${error ? `<div class="flash error" style="margin:0 0 16px;">Invalid email or password.</div>` : ""}
        <form method="POST" action="/login">
          <input type="hidden" name="next" value="${escapeHtml(ctx.query.next || "/")}" />
          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required autofocus />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required />
          </div>
          <button type="submit" class="btn btn-block btn-lg">Sign in</button>
        </form>
        <p class="small muted" style="margin-top:18px;">Demo logins — see the README for the full list of role-based accounts.</p>
      </div>`,
    });
    sendHtml(ctx.res, html);
  });

  router.post("/login", (ctx) => {
    const { email, password, next } = ctx.body;
    const user = get("SELECT * FROM users WHERE email = ?", [String(email || "").toLowerCase().trim()]);
    if (!user || !verifyPassword(password || "", user.password_hash)) {
      return redirect(ctx.res, "/login?error=1" + (next ? "&next=" + encodeURIComponent(next) : ""));
    }
    setSessionCookie(ctx.res, user);
    logAudit(user, "LOGIN", "user", user.id, "");
    redirect(ctx.res, next && next.startsWith("/") ? next : "/");
  });

  router.get("/logout", (ctx) => {
    const user = getCurrentUser(ctx.req);
    if (user) logAudit(user, "LOGOUT", "user", user.id, "");
    clearSessionCookie(ctx.res);
    redirect(ctx.res, "/login");
  });
}
