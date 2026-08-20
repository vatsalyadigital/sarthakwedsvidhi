import { getCurrentUser } from "./auth.js";
import { redirect } from "./router.js";
import { canWrite } from "./constants.js";

// Returns the logged-in user, or redirects to /login and returns null.
export function requireUser(ctx) {
  const user = getCurrentUser(ctx.req);
  if (!user) {
    redirect(ctx.res, "/login?next=" + encodeURIComponent(ctx.req.url));
    return null;
  }
  return user;
}

// Returns true if the user may write in `area`; otherwise redirects back with a flash-style
// query param and returns false. Read access is available to all logged-in roles.
export function requireWrite(ctx, user, area, fallbackPath) {
  if (canWrite(user.role, area)) return true;
  redirect(ctx.res, (fallbackPath || "/") + "?denied=1");
  return false;
}
