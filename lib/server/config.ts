import "server-only";
import path from "node:path";

// All environment access for the portal lives here. See README for the
// full list and what each one controls.

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Demo mode: seeded sample data, one-click sign-in per role, and a banner
// saying data resets. On by default on Vercel (whose disk is temporary).
// Once a real database is attached (DATABASE_URL), the demo switches off.
const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const demoMode = process.env.DEMO_MODE === "true" || (Boolean(process.env.VERCEL) && !hasDatabase && process.env.DEMO_MODE !== "false");
// Vercel's filesystem is read-only apart from /tmp.
const defaultDataDir = process.env.VERCEL ? "/tmp/expansion-portal" : path.join(process.cwd(), "data");
const dataDir = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || defaultDataDir);

export const config = {
  demoMode,
  dataDir,
  /** Managed Postgres (production). Vercel's Neon integration sets POSTGRES_URL / DATABASE_URL. */
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || null,
  /** Embedded Postgres (PGlite) folder when there's no DATABASE_URL; ":memory:" for tests. */
  databasePath: process.env.DATABASE_PATH || path.join(dataDir, "pgdata"),
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

  // Optional S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2,
  // MinIO…). When set, every uploaded file and every database backup is
  // also written there, so losing the server's disk loses nothing.
  s3: process.env.S3_BUCKET
    ? {
        bucket: process.env.S3_BUCKET,
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT || undefined,
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
        prefix: (process.env.S3_PREFIX || "expansion-portal").replace(/^\/+|\/+$/g, ""),
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      }
    : null,

  backupsDir: process.env.BACKUP_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.BACKUP_DIR) : path.join(/*turbopackIgnore: true*/ dataDir, "backups"),
  backupIntervalHours: int("BACKUP_INTERVAL_HOURS", 6),
  backupKeepLocal: int("BACKUP_KEEP", 60),

  sessionDays: int("SESSION_DAYS", 7),
  inviteDays: int("INVITE_DAYS", 7),
  // Uploads have no size limit: large files go straight to the bucket in
  // parts, or through the server in chunks small enough for any host.
  // Vercel functions accept at most 4.5 MB per request, hence 4 MB chunks there.
  chunkBytes: (process.env.VERCEL ? 4 : int("UPLOAD_CHUNK_MB", 16)) * 1024 * 1024,
  maxFilesPerProperty: int("MAX_FILES_PER_PROPERTY", 1000),
};
