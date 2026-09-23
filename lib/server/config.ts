import "server-only";
import path from "node:path";

// All environment access for the portal lives here. See README for the
// full list and what each one controls.

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const dataDir = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), "data"));

export const config = {
  dataDir,
  databasePath: process.env.DATABASE_PATH || path.join(dataDir, "expansion.db"),
  uploadsDir: path.join(dataDir, "uploads"),
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, ""),
  secureCookies: process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIES,

  bootstrapAdmin: {
    email: process.env.ADMIN_EMAIL?.trim().toLowerCase() || null,
    name: process.env.ADMIN_NAME?.trim() || "Access Manager",
    password: process.env.ADMIN_INITIAL_PASSWORD || null,
  },

  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: int("SMTP_PORT", 587),
        secure: process.env.SMTP_SECURE === "true",
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost",
      }
    : null,

  sessionDays: int("SESSION_DAYS", 7),
  inviteDays: int("INVITE_DAYS", 7),
  maxImageBytes: int("MAX_IMAGE_MB", 25) * 1024 * 1024,
  maxVideoBytes: int("MAX_VIDEO_MB", 500) * 1024 * 1024,
  maxMediaPerProperty: int("MAX_MEDIA_PER_PROPERTY", 40),
};
