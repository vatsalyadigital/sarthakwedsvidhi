import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { get } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const secretPath = path.join(dataDir, ".session_secret");

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, "utf8").trim();
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretPath, secret);
  return secret;
}

const SECRET = loadSecret();
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

// ---------------------------------------------------------------------------
// Password hashing (scrypt, no external deps)
// ---------------------------------------------------------------------------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

// ---------------------------------------------------------------------------
// Signed session cookie (stateless, HMAC-SHA256)
// ---------------------------------------------------------------------------
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function createSessionCookie(payload) {
  const body = { ...payload, exp: Date.now() + SESSION_MAX_AGE_SEC * 1000 };
  const json = JSON.stringify(body);
  const encoded = b64url(json);
  const sig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionCookie(cookieValue) {
  if (!cookieValue) return null;
  const [encoded, sig] = cookieValue.split(".");
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const session = verifySessionCookie(cookies.session);
  if (!session || !session.uid) return null;
  const user = get("SELECT id, name, email, role FROM users WHERE id = ?", [session.uid]);
  return user || null;
}

export function setSessionCookie(res, user) {
  const cookieValue = createSessionCookie({ uid: user.id });
  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `session=${encodeURIComponent(cookieValue)}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; SameSite=Lax${isProd ? "; Secure" : ""}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}
