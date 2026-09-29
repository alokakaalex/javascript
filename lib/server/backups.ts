import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pushRemote, remoteEnabled } from "./blobStore";
import { config } from "./config";
import { db, now } from "./db";
import { syncPendingFiles } from "./files";

// Automatic database backups. Every BACKUP_INTERVAL_HOURS a consistent
// snapshot of the database is written to BACKUP_DIR (default
// DATA_DIR/backups) and, if configured, to the S3 bucket. Local snapshots
// beyond BACKUP_KEEP are pruned; bucket copies are never deleted by the app
// (use bucket lifecycle rules if you want them to expire).

export interface BackupRecord {
  id: number;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  remoteCopy: boolean;
  trigger: string;
  error: string | null;
  createdAt: string;
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    fs.createReadStream(file).on("data", (c) => hash.update(c)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });
}

let running: Promise<BackupRecord> | null = null;

export function runBackup(trigger: "scheduled" | "manual" | "startup"): Promise<BackupRecord> {
  // One at a time; a second request waits for the one in progress.
  running ??= doBackup(trigger).finally(() => {
    running = null;
  });
  return running;
}

async function doBackup(trigger: string): Promise<BackupRecord> {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `expansion-${stamp}.db`;
  const file = path.join(config.backupsDir, fileName);
  let error: string | null = null;
  let size = 0;
  let sha = "";
  let remote = false;
  try {
    // VACUUM INTO writes a consistent, compacted copy while the app keeps running.
    db().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    size = fs.statSync(file).size;
    sha = await sha256File(file);
    if (remoteEnabled()) {
      remote = await pushRemote(`backups/${fileName}`, "application/vnd.sqlite3", sha);
      if (!remote) error = "Saved locally, but copying to the bucket failed (will retry next backup).";
      await syncPendingFiles();
    }
    prune();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error("[backup] failed", e);
  }
  const r = db()
    .prepare("INSERT INTO backups (file_name, size_bytes, sha256, remote_copy, trigger, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(fileName, size, sha, remote ? 1 : 0, trigger, error, now());
  return listBackups(1).find((b) => b.id === Number(r.lastInsertRowid))!;
}

function prune() {
  const files = fs
    .readdirSync(config.backupsDir)
    .filter((f) => /^expansion-.*\.db$/.test(f))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - config.backupKeepLocal))) {
    fs.rmSync(path.join(config.backupsDir, f), { force: true });
  }
}

export function listBackups(limit = 20): BackupRecord[] {
  const rows = db().prepare("SELECT * FROM backups ORDER BY id DESC LIMIT ?").all(limit) as {
    id: number;
    file_name: string;
    size_bytes: number;
    sha256: string;
    remote_copy: number;
    trigger: string;
    error: string | null;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    sizeBytes: r.size_bytes,
    sha256: r.sha256,
    remoteCopy: r.remote_copy === 1,
    trigger: r.trigger,
    error: r.error,
    createdAt: r.created_at,
  }));
}

export function storageStatus() {
  const files = db().prepare("SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes, SUM(remote_copy = 0) AS pending FROM files").get() as {
    n: number;
    bytes: number;
    pending: number | null;
  };
  return {
    files: files.n,
    bytes: files.bytes,
    pendingRemote: remoteEnabled() ? (files.pending ?? 0) : null,
    remoteEnabled: remoteEnabled(),
    bucket: config.s3 ? `${config.s3.bucket}/${config.s3.prefix}` : null,
    backupsDir: config.backupsDir,
    intervalHours: config.backupIntervalHours,
  };
}

/** True when there's been no successful backup for over two intervals. */
export function backupIsStale(): boolean {
  const ok = db().prepare("SELECT created_at FROM backups WHERE error IS NULL ORDER BY id DESC LIMIT 1").get() as { created_at: string } | undefined;
  return !ok || Date.now() - Date.parse(ok.created_at) > (config.backupIntervalHours * 2 + 1) * 3_600_000;
}

// --- Scheduler ------------------------------------------------------------------

const globalForJobs = globalThis as unknown as { __expansionJobs?: NodeJS.Timeout };

/** Starts the periodic backup (once per process). Takes a backup now if the last one is older than the interval. */
export function startBackgroundJobs() {
  if (globalForJobs.__expansionJobs || process.env.VITEST) return;
  const intervalMs = config.backupIntervalHours * 3_600_000;
  const tick = () => {
    const last = listBackups(1)[0];
    if (!last || Date.now() - Date.parse(last.createdAt) >= intervalMs - 60_000) {
      runBackup(last ? "scheduled" : "startup").catch((e) => console.error("[backup] failed", e));
    }
  };
  globalForJobs.__expansionJobs = setInterval(tick, 10 * 60_000);
  globalForJobs.__expansionJobs.unref();
  setTimeout(tick, 5_000).unref();
}
