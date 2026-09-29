import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ROLE_INFO, type Role } from "@/lib/expansion/roles";
import type { User } from "@/lib/expansion/types";
import { config } from "./config";
import { randomToken, sha256 } from "./crypto";
import { db, now } from "./db";
import { ensureDemo } from "./demo";
import { toUser, type UserRow } from "./users";

// Database-backed sessions: the cookie holds a random token, the database
// holds its hash. Role and status are read fresh on every request, so a
// role change or a disabled account takes effect immediately.

const COOKIE = "expansion_session";

// The demo can run on several short-lived server instances that don't
// share a database, so its sessions are signed cookies (user id + expiry +
// HMAC) that any instance can check. Real deployments use the table above.
const DEMO_SECRET = process.env.DEMO_SECRET || process.env.VERCEL_DEPLOYMENT_ID || "expansion-portal-demo";

function demoToken(userId: string, expires: Date): string {
  const body = `${userId}.${expires.getTime()}`;
  return `${body}.${createHmac("sha256", DEMO_SECRET).update(body).digest("base64url")}`;
}

function demoUserId(token: string): string | null {
  const [userId, exp] = token.split(".");
  if (!userId || !exp || Number(exp) < Date.now()) return null;
  const expected = demoToken(userId, new Date(Number(exp)));
  return expected.length === token.length && timingSafeEqual(Buffer.from(expected), Buffer.from(token)) ? userId : null;
}

export async function startSession(userId: string, userAgent: string | null) {
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000);
  if (config.demoMode) {
    (await cookies()).set(COOKIE, demoToken(userId, expires), { httpOnly: true, secure: config.secureCookies, sameSite: "lax", path: "/", expires });
    return;
  }
  const token = randomToken();
  db()
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, user_agent) VALUES (?, ?, ?, ?, ?)")
    .run(sha256(token), userId, expires.toISOString(), now(), userAgent?.slice(0, 300) ?? null);
  // Opportunistic cleanup of expired sessions.
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  store.delete(COOKIE);
}

/** The signed-in user for this request, or null. */
export const currentUser = cache(async (): Promise<User | null> => {
  await ensureDemo();
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  if (config.demoMode) {
    const id = demoUserId(token);
    const row = id ? db().prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(id) : undefined;
    return row ? toUser(row as unknown as UserRow) : null;
  }
  const row = db()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`,
    )
    .get(sha256(token), now());
  return row ? toUser(row as unknown as UserRow) : null;
});

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Guards a portal page: other roles are sent to their own portal. */
export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(ROLE_INFO[user.role].portal);
  return user;
}
