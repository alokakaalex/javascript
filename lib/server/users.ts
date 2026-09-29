import "server-only";
import { randomUUID } from "node:crypto";
import { ROLE_INFO, type Role } from "@/lib/expansion/roles";
import type { User, UserStatus } from "@/lib/expansion/types";
import { audit } from "./audit";
import { config } from "./config";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { db, now, tx } from "./db";
import { emailEnabled, sendEmail } from "./mailer";

export class UserError extends Error {}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  sales_approver: number;
  password_hash: string | null;
  failed_logins: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    salesApprover: row.sales_approver === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

function rowById(id: string): UserRow | undefined {
  return db().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

function rowByEmail(email: string): UserRow | undefined {
  return db().prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as UserRow | undefined;
}

export function getUser(id: string): User | null {
  const row = rowById(id);
  return row ? toUser(row) : null;
}

export function listUsers(): User[] {
  const rows = db()
    .prepare("SELECT * FROM users ORDER BY status = 'disabled', role, name COLLATE NOCASE")
    .all() as unknown as UserRow[];
  return rows.map(toUser);
}

export function countUsers(): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!EMAIL_RE.test(value) || value.length > 254) throw new UserError("Enter a valid email address.");
  return value;
}

export function validatePassword(password: string) {
  if (password.length < 10) throw new UserError("Password must be at least 10 characters.");
  if (password.length > 200) throw new UserError("Password is too long.");
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new UserError("Password must contain at least one letter and one number.");
  }
}

// --- Invite / reset links ---------------------------------------------------

export interface IssuedLink {
  url: string;
  emailed: boolean;
}

function issueToken(user: UserRow, purpose: "invite" | "reset"): IssuedLink {
  const token = randomToken();
  const expires = new Date(Date.now() + config.inviteDays * 86_400_000).toISOString();
  // Only the newest link for a user works.
  db().prepare("DELETE FROM auth_tokens WHERE user_id = ? AND used_at IS NULL").run(user.id);
  db()
    .prepare(
      `INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sha256(token), user.id, purpose, expires, now());

  const url = `${config.appUrl}/invite/${token}`;
  const role = ROLE_INFO[user.role].label;
  sendEmail({
    to: user.email,
    subject: purpose === "invite" ? "You've been given access to the Expansion Portal" : "Reset your Expansion Portal password",
    text:
      purpose === "invite"
        ? `Hi ${user.name},\n\nYou've been added to the Expansion Portal as ${role}. Set your password to sign in:\n\n${url}\n\nThis link expires in ${config.inviteDays} days.`
        : `Hi ${user.name},\n\nUse this link to set a new password:\n\n${url}\n\nThis link expires in ${config.inviteDays} days.`,
  });
  return { url, emailed: emailEnabled() };
}

export function inviteUser(
  actor: User,
  input: { email: string; name: string; role: Role; salesApprover?: boolean },
): { user: User; link: IssuedLink } {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!name) throw new UserError("Enter the person's name.");
  if (name.length > 120) throw new UserError("Name is too long.");

  return tx(() => {
    if (rowByEmail(email)) throw new UserError(`${email} already has an account.`);
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO users (id, email, name, role, status, sales_approver, created_by, created_at)
         VALUES (?, ?, ?, ?, 'invited', ?, ?, ?)`,
      )
      .run(id, email, name, input.role, input.role === "sales" && input.salesApprover ? 1 : 0, actor.id, now());
    const row = rowById(id)!;
    audit({
      actorId: actor.id,
      action: "user.invited",
      subjectUserId: id,
      details: `as ${ROLE_INFO[input.role].label}${input.role === "sales" && input.salesApprover ? " (can approve)" : ""}`,
    });
    return { user: toUser(row), link: issueToken(row, "invite") };
  });
}

/** New invite for someone who hasn't accepted yet, or a password reset link for an active user. */
export function issueAccessLink(actor: User, userId: string): IssuedLink {
  return tx(() => {
    const row = rowById(userId);
    if (!row) throw new UserError("User not found.");
    if (row.status === "disabled") throw new UserError("Re-enable this user before sending a link.");
    const purpose = row.status === "invited" ? "invite" : "reset";
    audit({ actorId: actor.id, action: purpose === "invite" ? "user.invite_resent" : "user.reset_link", subjectUserId: userId });
    return issueToken(row, purpose);
  });
}

interface TokenRow {
  user_id: string;
  purpose: "invite" | "reset";
  expires_at: string;
  used_at: string | null;
}

function liveToken(token: string): TokenRow | null {
  const row = db()
    .prepare("SELECT user_id, purpose, expires_at, used_at FROM auth_tokens WHERE token_hash = ?")
    .get(sha256(token)) as TokenRow | undefined;
  if (!row || row.used_at || row.expires_at < now()) return null;
  return row;
}

/** Who a link belongs to, for the set-password page. Null if invalid, used or expired. */
export function inspectToken(token: string): { user: User; purpose: "invite" | "reset" } | null {
  const t = liveToken(token);
  if (!t) return null;
  const row = rowById(t.user_id);
  if (!row || row.status === "disabled") return null;
  return { user: toUser(row), purpose: t.purpose };
}

export async function redeemToken(token: string, password: string): Promise<User> {
  validatePassword(password);
  const hash = await hashPassword(password);
  return tx(() => {
    const t = liveToken(token);
    const row = t ? rowById(t.user_id) : undefined;
    if (!t || !row || row.status === "disabled") {
      throw new UserError("This link is invalid or has expired. Ask your access manager for a new one.");
    }
    db().prepare("UPDATE auth_tokens SET used_at = ? WHERE token_hash = ?").run(now(), sha256(token));
    db()
      .prepare(
        `UPDATE users SET password_hash = ?, status = 'active', failed_logins = 0, locked_until = NULL
         WHERE id = ?`,
      )
      .run(hash, row.id);
    // A reset signs out every other device.
    db().prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
    audit({ actorId: row.id, action: t.purpose === "invite" ? "user.activated" : "user.password_reset", subjectUserId: row.id });
    return toUser(rowById(row.id)!);
  });
}

// --- Sign in ----------------------------------------------------------------

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function authenticate(email: string, password: string): Promise<User> {
  const row = rowByEmail(email.toLowerCase());
  const ok = await verifyPassword(password, row?.password_hash ?? null);
  const generic = new UserError("Incorrect email or password.");
  if (!row) throw generic;

  if (row.locked_until && row.locked_until > now()) {
    throw new UserError(`Too many failed attempts. Try again after ${LOCK_MINUTES} minutes, or ask your access manager to reset your password.`);
  }
  if (row.status === "disabled") throw new UserError("Your access has been disabled. Contact your access manager.");
  if (row.status === "invited") throw new UserError("Finish setting up your account using the invite link you were sent.");

  if (!ok) {
    const failed = row.failed_logins + 1;
    const lockedUntil = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    db()
      .prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?")
      .run(lockedUntil ? 0 : failed, lockedUntil, row.id);
    if (lockedUntil) audit({ actorId: null, action: "user.locked", subjectUserId: row.id });
    throw generic;
  }

  db()
    .prepare("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?")
    .run(now(), row.id);
  return toUser({ ...row, last_login_at: now() });
}

export async function changePassword(user: User, current: string, next: string) {
  const row = rowById(user.id);
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw new UserError("Current password is incorrect.");
  }
  validatePassword(next);
  const hash = await hashPassword(next);
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
  audit({ actorId: user.id, action: "user.password_changed", subjectUserId: user.id });
}

// --- Access management ------------------------------------------------------

function activeAdminCount(): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get() as { n: number }).n;
}

export function changeRole(actor: User, userId: string, role: Role) {
  tx(() => {
    const row = rowById(userId);
    if (!row) throw new UserError("User not found.");
    if (row.role === role) return;
    if (row.id === actor.id) throw new UserError("You can't change your own role. Ask another access manager.");
    if (row.role === "admin" && row.status === "active" && activeAdminCount() <= 1) {
      throw new UserError("There must always be at least one active access manager.");
    }
    db().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
    audit({
      actorId: actor.id,
      action: "user.role_changed",
      subjectUserId: userId,
      details: `${ROLE_INFO[row.role].label} → ${ROLE_INFO[role].label}`,
    });
  });
}

export function setUserEnabled(actor: User, userId: string, enabled: boolean) {
  tx(() => {
    const row = rowById(userId);
    if (!row) throw new UserError("User not found.");
    if (row.id === actor.id) throw new UserError("You can't disable your own account.");
    if (enabled) {
      if (row.status !== "disabled") return;
      // Someone who never set a password goes back to "invited".
      const status = row.password_hash ? "active" : "invited";
      db().prepare("UPDATE users SET status = ?, failed_logins = 0, locked_until = NULL WHERE id = ?").run(status, userId);
      audit({ actorId: actor.id, action: "user.enabled", subjectUserId: userId });
    } else {
      if (row.status === "disabled") return;
      if (row.role === "admin" && row.status === "active" && activeAdminCount() <= 1) {
        throw new UserError("There must always be at least one active access manager.");
      }
      db().prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(userId);
      db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
      db().prepare("DELETE FROM auth_tokens WHERE user_id = ? AND used_at IS NULL").run(userId);
      audit({ actorId: actor.id, action: "user.disabled", subjectUserId: userId });
    }
  });
}

/** Gives or removes a sales team member's right to approve/reject (others in sales have view access). */
export function setSalesApprover(actor: User, userId: string, approver: boolean) {
  tx(() => {
    const row = rowById(userId);
    if (!row) throw new UserError("User not found.");
    if (row.role !== "sales") throw new UserError("Only sales team members have approval access to set.");
    if ((row.sales_approver === 1) === approver) return;
    db().prepare("UPDATE users SET sales_approver = ? WHERE id = ?").run(approver ? 1 : 0, userId);
    audit({ actorId: actor.id, action: approver ? "user.sales_approver_on" : "user.sales_approver_off", subjectUserId: userId });
  });
}

export function salesApproverCount(): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'sales' AND status = 'active' AND sales_approver = 1").get() as { n: number }).n;
}
