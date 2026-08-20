import { URL } from "node:url";

export class Router {
  constructor() {
    this.routes = []; // {method, pattern, keys, handler}
  }

  _add(method, pattern, handler) {
    const keys = [];
    const regexStr = pattern
      .replace(/\/:[a-zA-Z0-9_]+/g, (m) => {
        keys.push(m.slice(2));
        return "/([^/]+)";
      })
      .replace(/\*/g, ".*");
    const regex = new RegExp(`^${regexStr}$`);
    this.routes.push({ method, regex, keys, handler });
  }

  get(pattern, handler) { this._add("GET", pattern, handler); }
  post(pattern, handler) { this._add("POST", pattern, handler); }

  async handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = pathname.match(route.regex);
      if (!match) continue;
      const params = {};
      route.keys.forEach((key, i) => (params[key] = match[i + 1]));
      const ctx = {
        req,
        res,
        params,
        query: Object.fromEntries(url.searchParams.entries()),
      };
      if (req.method === "POST") {
        ctx.body = await parseBody(req);
      }
      try {
        await route.handler(ctx);
      } catch (err) {
        console.error("Route error:", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(`<pre>Internal Server Error: ${escapeForPre(err.stack || err.message)}</pre>`);
        }
      }
      return true;
    }
    return false;
  }
}

function escapeForPre(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX = 5 * 1024 * 1024; // 5MB safety cap (no file uploads expected)
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const contentType = req.headers["content-type"] || "";
      try {
        if (contentType.includes("application/json")) {
          resolve(raw ? JSON.parse(raw) : {});
        } else {
          resolve(Object.fromEntries(new URLSearchParams(raw).entries()));
        }
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
export function sendHtml(res, html, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

export function sendJson(res, obj, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

export function sendCsv(res, filename, csvText) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(csvText);
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => esc(typeof c.value === "function" ? c.value(row) : row[c.value])).join(","));
  return [header, ...lines].join("\n");
}
