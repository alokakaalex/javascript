import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { config } from "./config";
import { hashPasswordSync } from "./crypto";

// SQLite via Node's built-in driver: one file under DATA_DIR, no separate
// database server to run. All queries go through the modules in lib/server,
// so moving to Postgres later is contained to this layer.

// Each entry runs once, in order; PRAGMA user_version records progress.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
    password_hash TEXT,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_login_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    round INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    address TEXT NOT NULL,
    map_url TEXT,
    latitude REAL,
    longitude REAL,
    owner_name TEXT NOT NULL,
    area_sqft REAL NOT NULL,
    rent_per_month REAL NOT NULL,
    security_deposit REAL NOT NULL,
    advance_rent REAL NOT NULL,
    lease_tenure_months INTEGER NOT NULL,
    rent_escalation_pct REAL NOT NULL,
    rent_free_days INTEGER NOT NULL,
    handover_date TEXT NOT NULL,
    lock_in_months INTEGER NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    submitted_at TEXT
  );
  CREATE INDEX properties_status ON properties(status);
  CREATE INDEX properties_creator ON properties(created_by);

  CREATE TABLE media (
    id TEXT PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    mime TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX media_property ON media(property_id);

  CREATE TABLE decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    stage TEXT NOT NULL CHECK (stage IN ('sales', 'ops', 'business')),
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'passed')),
    remarks TEXT NOT NULL,
    decided_by TEXT NOT NULL REFERENCES users(id),
    decided_at TEXT NOT NULL,
    UNIQUE (property_id, round, stage)
  );

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX notifications_user ON notifications(user_id, read_at);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    subject_user_id TEXT REFERENCES users(id),
    details TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX audit_property ON audit_log(property_id);
  `,
];

function open(): DatabaseSync {
  if (config.databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  }
  const db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  bootstrapAdmin(db);
  return db;
}

// The first access manager comes from ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD,
// set by whoever deploys the app. It is created once; later changes to the
// env vars don't touch an existing account (change the password in-app).
function bootstrapAdmin(db: DatabaseSync) {
  const { email, name, password } = config.bootstrapAdmin;
  if (!email || !password) return;
  const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
  if (exists) return;
  db.prepare(
    `INSERT INTO users (id, email, name, role, status, password_hash, created_at)
     VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
  ).run(randomUUID(), email, name, hashPasswordSync(password), now());
}

function migrate(db: DatabaseSync) {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

let depth = 0;

// Re-entrant: a service that runs inside another service's transaction
// joins it instead of trying to open a nested one.
function transaction<T>(db: DatabaseSync, fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  try {
    return runTransaction(db, fn);
  } finally {
    depth--;
  }
}

function runTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// Reuse one connection across dev-server hot reloads.
const globalForDb = globalThis as unknown as { __expansionDb?: DatabaseSync };

export function db(): DatabaseSync {
  globalForDb.__expansionDb ??= open();
  return globalForDb.__expansionDb;
}

export function tx<T>(fn: () => T): T {
  return transaction(db(), fn);
}

/** Tests only: drop the connection so the next db() call starts fresh. */
export function resetDbForTests() {
  globalForDb.__expansionDb?.close();
  globalForDb.__expansionDb = undefined;
}

export function now(): string {
  return new Date().toISOString();
}
