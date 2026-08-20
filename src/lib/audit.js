import { run } from "./db.js";

export function logAudit(user, action, entityType, entityId, details = "") {
  run(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`,
    [user ? user.id : null, action, entityType || null, entityId || null, details]
  );
}
