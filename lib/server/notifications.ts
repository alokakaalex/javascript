import "server-only";
import type { Role } from "@/lib/expansion/roles";
import type { Notification } from "@/lib/expansion/types";
import { config } from "./config";
import { db, now } from "./db";
import { sendEmail } from "./mailer";

export interface NewNotification {
  propertyId: number | null;
  title: string;
  body: string;
  link: string | null;
}

interface Recipient {
  id: string;
  email: string;
}

function deliver(recipients: Recipient[], n: NewNotification) {
  const insert = db().prepare(
    `INSERT INTO notifications (user_id, property_id, title, body, link, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const at = now();
  for (const r of recipients) {
    insert.run(r.id, n.propertyId, n.title, n.body, n.link, at);
    sendEmail({
      to: r.email,
      subject: n.title,
      text: `${n.body}${n.link ? `\n\nOpen: ${config.appUrl}${n.link}` : ""}`,
    });
  }
}

export function notifyUser(userId: string, n: NewNotification) {
  const user = db()
    .prepare("SELECT id, email FROM users WHERE id = ? AND status = 'active'")
    .get(userId) as Recipient | undefined;
  if (user) deliver([user], n);
}

/** Notifies every active member of a team. */
export function notifyRole(role: Role, n: NewNotification) {
  const users = db()
    .prepare("SELECT id, email FROM users WHERE role = ? AND status = 'active'")
    .all(role) as unknown as Recipient[];
  deliver(users, n);
}

interface NotificationRow {
  id: number;
  property_id: number | null;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function listNotifications(userId: string, limit = 100): Notification[] {
  const rows = db()
    .prepare(
      `SELECT id, property_id, title, body, link, read_at, created_at
       FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(userId, limit) as unknown as NotificationRow[];
  return rows.map((r) => ({
    id: r.id,
    propertyId: r.property_id,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export function unreadCount(userId: string): number {
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .get(userId) as { n: number };
  return row.n;
}

export function markRead(userId: string, notificationId?: number) {
  if (notificationId === undefined) {
    db()
      .prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
      .run(now(), userId);
  } else {
    db()
      .prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL")
      .run(now(), userId, notificationId);
  }
}
