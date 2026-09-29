import "server-only";
import type { User } from "@/lib/expansion/types";
import { audit } from "./audit";
import { db, now } from "./db";

// Settings the access manager can change in the app.

export interface Settings {
  /** Sales votes needed to approve a property (default 1: the first approval moves it on). */
  salesApprovalsRequired: number;
  /** Sales votes needed to reject it. */
  salesRejectionsRequired: number;
}

const DEFAULTS: Settings = { salesApprovalsRequired: 1, salesRejectionsRequired: 1 };

export function getSettings(): Settings {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULTS, ...stored };
}

export function updateSettings(actor: User, next: Settings) {
  for (const [key, value] of Object.entries(next)) {
    if (!Number.isInteger(value) || value < 1 || value > 50) throw new Error(`Invalid value for ${key}`);
  }
  const upsert = db().prepare(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  );
  for (const [key, value] of Object.entries(next)) upsert.run(key, JSON.stringify(value), actor.id, now());
  audit({ actorId: actor.id, action: "settings.updated", details: JSON.stringify(next) });
}
