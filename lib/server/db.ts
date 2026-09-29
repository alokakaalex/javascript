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
    user_id TEXT NOT NULL REFERENCES users(id),
    purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT NOT NULL CHECK (state IN ('draft', 'active', 'on_hold', 'rejected', 'completed')),
    stage TEXT,
    round INTEGER NOT NULL DEFAULT 0,
    furthest_stage INTEGER NOT NULL DEFAULT -1,
    store_name TEXT NOT NULL,
    address TEXT NOT NULL,
    map_url TEXT,
    latitude REAL,
    longitude REAL,
    total_area_sqft REAL NOT NULL,
    carpet_area_sqft REAL NOT NULL,
    asking_rent REAL NOT NULL,
    security_deposit REAL NOT NULL,
    advance_rent REAL NOT NULL,
    lock_in_months INTEGER NOT NULL,
    structure_type TEXT NOT NULL CHECK (structure_type IN ('tin', 'shed', 'rcc')),
    structure_height_ft REAL NOT NULL,
    rent_free_days INTEGER NOT NULL,
    handover_date TEXT NOT NULL,
    lease_tenure_months INTEGER,
    rent_escalation_pct REAL,
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    submitted_at TEXT,
    documents_completed_at TEXT,
    loi_sent_at TEXT,
    loi_sent_to TEXT,
    completed_at TEXT
  );
  CREATE INDEX properties_stage ON properties(state, stage);
  CREATE INDEX properties_creator ON properties(created_by);

  CREATE TABLE owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_organisation INTEGER NOT NULL DEFAULT 0,
    gst_number TEXT,
    pan_number TEXT,
    bank_account_name TEXT,
    bank_account_number TEXT,
    bank_ifsc TEXT,
    bank_name TEXT,
    archived_at TEXT,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX owners_property ON owners(property_id);

  -- Every uploaded file. Rows are never deleted: removing or replacing a
  -- file sets archived_at, and the bytes stay in storage.
  CREATE TABLE files (
    id TEXT PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    owner_id INTEGER REFERENCES owners(id),
    payment_id INTEGER REFERENCES payments(id),
    category TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'pdf', 'doc')),
    mime TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    remote_copy INTEGER NOT NULL DEFAULT 0,
    uploaded_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    archived_at TEXT,
    archived_by TEXT REFERENCES users(id)
  );
  CREATE INDEX files_property ON files(property_id, category);

  CREATE TABLE decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    round INTEGER NOT NULL,
    stage TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'hold')),
    remarks TEXT NOT NULL,
    decided_by TEXT NOT NULL REFERENCES users(id),
    decided_at TEXT NOT NULL
  );
  CREATE INDEX decisions_property ON decisions(property_id, round, stage);

  CREATE TABLE ops_visits (
    property_id INTEGER NOT NULL REFERENCES properties(id),
    round INTEGER NOT NULL,
    visited_at TEXT,
    visited_by TEXT REFERENCES users(id),
    scope_of_work TEXT NOT NULL DEFAULT '',
    updated_by TEXT REFERENCES users(id),
    updated_at TEXT,
    PRIMARY KEY (property_id, round)
  );

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    kind TEXT NOT NULL CHECK (kind IN ('token', 'balance', 'stamp_duty')),
    status TEXT NOT NULL CHECK (status IN ('requested', 'paid')),
    requested_amount REAL,
    requested_by TEXT REFERENCES users(id),
    requested_at TEXT,
    request_remarks TEXT,
    amount REAL,
    utr TEXT,
    paid_on TEXT,
    paid_by TEXT REFERENCES users(id),
    paid_at TEXT,
    notes TEXT
  );
  CREATE INDEX payments_property ON payments(property_id, kind);

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    property_id INTEGER REFERENCES properties(id),
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
    property_id INTEGER REFERENCES properties(id),
    subject_user_id TEXT REFERENCES users(id),
    details TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX audit_property ON audit_log(property_id);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_by TEXT REFERENCES users(id),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    remote_copy INTEGER NOT NULL DEFAULT 0,
    trigger TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL
  );

  -- Business records are append-only: the database itself refuses to
  -- delete them, whatever the application code does.
  CREATE TRIGGER properties_no_delete BEFORE DELETE ON properties BEGIN SELECT RAISE(ABORT, 'properties are never deleted'); END;
  CREATE TRIGGER owners_no_delete BEFORE DELETE ON owners BEGIN SELECT RAISE(ABORT, 'owners are never deleted'); END;
  CREATE TRIGGER files_no_delete BEFORE DELETE ON files BEGIN SELECT RAISE(ABORT, 'files are never deleted'); END;
  CREATE TRIGGER decisions_no_delete BEFORE DELETE ON decisions BEGIN SELECT RAISE(ABORT, 'decisions are never deleted'); END;
  CREATE TRIGGER decisions_no_update BEFORE UPDATE ON decisions BEGIN SELECT RAISE(ABORT, 'decisions are never changed'); END;
  CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT, 'payments are never deleted'); END;
  CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit entries are never deleted'); END;
  CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit entries are never changed'); END;
  CREATE TRIGGER users_no_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'users are disabled, never deleted'); END;
  `,
  // Only designated sales team members may approve or reject; the rest view.
  `ALTER TABLE users ADD COLUMN sales_approver INTEGER NOT NULL DEFAULT 0;`,
];

function open(): DatabaseSync {
  // Serverless hosts wipe the filesystem between invocations; running real
  // data there would silently lose every document. Only the demo may run.
  if (process.env.VERCEL && !config.demoMode && !process.env.VITEST) {
    throw new Error(
      "The Expansion Portal needs a server with a persistent disk and can't run on Vercel. Deploy it with render.yaml or Docker (see README → Going live).",
    );
  }
  if (config.databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  }
  const db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'media'").get()) {
    throw new Error(
      `${config.databasePath} was created by an earlier preview build with a different schema. Move it aside (or point DATA_DIR at a new folder) and restart.`,
    );
  }
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
