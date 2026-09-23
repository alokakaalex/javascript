import "server-only";
import type { AuditEntry } from "@/lib/expansion/types";
import { db, now } from "./db";

export function audit(entry: {
  actorId: string | null;
  action: string;
  propertyId?: number;
  subjectUserId?: string;
  details?: string;
}) {
  db()
    .prepare(
      `INSERT INTO audit_log (actor_id, action, property_id, subject_user_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.actorId,
      entry.action,
      entry.propertyId ?? null,
      entry.subjectUserId ?? null,
      entry.details ?? null,
      now(),
    );
}

interface AuditRow {
  id: number;
  actor_name: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

function toEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    actorName: row.actor_name,
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
  };
}

export function propertyAudit(propertyId: number): AuditEntry[] {
  const rows = db()
    .prepare(
      `SELECT a.id, u.name AS actor_name, a.action, a.details, a.created_at
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.property_id = ? ORDER BY a.id DESC`,
    )
    .all(propertyId) as unknown as AuditRow[];
  return rows.map(toEntry);
}

export function accessAudit(limit = 100): AuditEntry[] {
  const rows = db()
    .prepare(
      `SELECT a.id, u.name AS actor_name, a.action,
              COALESCE(s.email || CASE WHEN a.details IS NULL THEN '' ELSE ' — ' || a.details END, a.details) AS details,
              a.created_at
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN users s ON s.id = a.subject_user_id
       WHERE a.property_id IS NULL ORDER BY a.id DESC LIMIT ?`,
    )
    .all(limit) as unknown as AuditRow[];
  return rows.map(toEntry);
}
