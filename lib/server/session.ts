import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ROLE_INFO, type Role } from "@/lib/expansion/roles";
import type { User } from "@/lib/expansion/types";
import { config } from "./config";
import { randomToken, sha256 } from "./crypto";
import { db, now } from "./db";
import { toUser, type UserRow } from "./users";

// Database-backed sessions: the cookie holds a random token, the database
// holds its hash. Role and status are read fresh on every request, so a
// role change or a disabled account takes effect immediately.

const COOKIE = "expansion_session";

export async function startSession(userId: string, userAgent: string | null) {
  const token = randomToken();
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000);
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
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
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
