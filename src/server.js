import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./lib/db.js"; // ensures schema is created before anything else
import { Router } from "./lib/router.js";

import { registerAuthRoutes } from "./routes/auth.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerWeddingRoutes } from "./routes/wedding.js";
import { registerFunctionRoutes } from "./routes/functions.js";
import { registerVendorRoutes } from "./routes/vendors.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerGuestRoutes } from "./routes/guests.js";
import { registerGuestPortalRoutes } from "./routes/guestPortal.js";
import { registerRoomRoutes } from "./routes/rooms.js";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerSettingsRoutes } from "./routes/settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const router = new Router();

registerAuthRoutes(router);
registerDashboardRoutes(router);
registerWeddingRoutes(router);
registerFunctionRoutes(router);
registerVendorRoutes(router);
registerPaymentRoutes(router);
registerGuestRoutes(router);
registerGuestPortalRoutes(router);
registerRoomRoutes(router);
registerDocumentRoutes(router);
registerReportRoutes(router);
registerSearchRoutes(router);
registerSettingsRoutes(router);

const STATIC_TYPES = { ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (!/^\/[a-zA-Z0-9._-]+$/.test(urlPath)) return false;
  const filePath = path.join(publicDir, urlPath);
  if (!filePath.startsWith(publicDir)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const ext = path.extname(filePath);
  res.setHeader("Content-Type", STATIC_TYPES[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=300");
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && serveStatic(req, res)) return;

  const handled = await router.handle(req, res);
  if (!handled && !res.headersSent) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:60px;text-align:center;color:#6b6355;">
      <h1 style="font-family:Georgia,serif;color:#2b2620;">Page not found</h1>
      <p>That page doesn't exist. <a href="/">Return to dashboard</a>.</p>
    </body></html>`);
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Wedding ERP running at http://localhost:${PORT}`);
});
