import "server-only";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { StoredFile, User } from "@/lib/expansion/types";
import { CATEGORY_INFO, isEditable, stageIndex, type FileCategory } from "@/lib/expansion/workflow";
import { audit } from "./audit";
import { ensureLocal, localPath, pushRemote } from "./blobStore";
import { config } from "./config";
import { db, now, tx } from "./db";
import { canAccess, canSeeFile, propertyRow, PropertyError, type FileRow, type PropertyRow } from "./properties";

// Uploads: every file is checked against its declared type, hashed
// (SHA-256, so its integrity can be verified later), stored locally and,
// if configured, copied to the S3 bucket. Files are never deleted; removing
// or replacing one archives it.

type Kind = StoredFile["kind"];

const MEDIA_TYPES: Record<string, Kind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/avif": "image",
  "image/heic": "image",
  "image/heif": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
};

const DOCUMENT_TYPES: Record<string, Kind> = {
  "application/pdf": "pdf",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/heic": "image",
  "image/heif": "image",
};

const WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_ALLOWED: FileCategory[] = ["loi", "signed_loi", "agreement", "other_document"];

export function allowedTypes(category: FileCategory): Record<string, Kind> {
  if (CATEGORY_INFO[category].kind === "media") return MEDIA_TYPES;
  return WORD_ALLOWED.includes(category) ? { ...DOCUMENT_TYPES, [WORD]: "doc" } : DOCUMENT_TYPES;
}

export function acceptAttribute(category: FileCategory): string {
  return Object.keys(allowedTypes(category)).join(",");
}

/** Checks the file's leading bytes match its declared type, so a script can't be uploaded as "image/png". */
export function matchesSignature(mime: string, head: Uint8Array): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...head.slice(start, end));
  switch (mime) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return head[0] === 0x89 && ascii(1, 4) === "PNG";
    case "image/gif":
      return ascii(0, 4) === "GIF8";
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/avif":
    case "image/heic":
    case "image/heif":
    case "video/mp4":
    case "video/quicktime":
      return ["ftyp", "moov", "mdat", "wide"].includes(ascii(4, 8));
    case "video/webm":
      return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    case WORD:
      return ascii(0, 4) === "PK\x03\x04";
    default:
      return false;
  }
}

function hasOpenStampRequest(propertyId: number): boolean {
  return Boolean(
    db().prepare("SELECT 1 FROM payments WHERE property_id = ? AND kind = 'stamp_duty' AND status = 'requested'").get(propertyId),
  );
}

/** Whether this viewer may add (or archive) a file of this category on this property right now. */
export function canUpload(viewer: User, row: PropertyRow, category: FileCategory): boolean {
  if (!CATEGORY_INFO[category].uploaders.includes(viewer.role)) return false;
  if (!canAccess(viewer, row)) return false;
  const at = (stage: Parameters<typeof stageIndex>[0]) => row.stage === stage && row.state === "active";
  const reached = (stage: Parameters<typeof stageIndex>[0]) => row.furthest_stage >= stageIndex(stage);
  switch (category) {
    case "property_media":
      return isEditable(row.state);
    case "ops_media":
      return at("ops_review");
    case "loi":
      return at("loi") || at("signed_loi");
    case "signed_loi":
      return at("signed_loi");
    case "agreement":
      return at("agreement");
    case "stamp_duty_calculation":
      return reached("token_payment");
    case "token_receipt":
      return at("token_payment");
    case "balance_receipt":
      return at("balance_payment");
    case "stamp_duty_receipt":
      return hasOpenStampRequest(row.id);
    default:
      // Owner KYC and property documents: from the documents stage onward.
      return reached("documents") && row.state !== "rejected";
  }
}

export interface UploadInput {
  category: FileCategory;
  ownerId: number | null;
  mime: string;
  originalName: string;
  declaredSize: number | null;
  body: ReadableStream<Uint8Array>;
}

export async function saveUpload(viewer: User, propertyId: number, upload: UploadInput): Promise<{ id: string }> {
  const { category } = upload;
  const info = CATEGORY_INFO[category];
  const row = propertyRow(propertyId);
  if (!row || !canAccess(viewer, row)) throw new PropertyError("Property not found.");
  if (!canUpload(viewer, row, category)) throw new PropertyError(`You can't upload a ${info.label.toLowerCase()} at this stage.`);

  let ownerId: number | null = null;
  if (info.perOwner) {
    const owner = upload.ownerId
      ? db().prepare("SELECT id FROM owners WHERE id = ? AND property_id = ? AND archived_at IS NULL").get(upload.ownerId, propertyId)
      : undefined;
    if (!owner) throw new PropertyError("Choose which owner this document belongs to.");
    ownerId = upload.ownerId;
  }

  const mime = upload.mime.split(";")[0].trim().toLowerCase();
  const types = allowedTypes(category);
  const kind = types[mime];
  if (!kind) {
    throw new PropertyError(
      info.kind === "media"
        ? "Only JPEG, PNG, WebP, GIF, AVIF or HEIC photos and MP4, MOV or WebM videos can be uploaded."
        : `Only PDF or image files${WORD_ALLOWED.includes(category) ? " (or Word .docx)" : ""} can be uploaded here.`,
    );
  }
  const limit = kind === "video" ? config.maxVideoBytes : kind === "image" && info.kind === "media" ? config.maxImageBytes : config.maxDocumentBytes;
  const tooBig = new PropertyError(`This file is over the ${Math.round(limit / 1024 / 1024)} MB limit.`);
  if (upload.declaredSize !== null && upload.declaredSize > limit) throw tooBig;
  const count = (db().prepare("SELECT COUNT(*) AS n FROM files WHERE property_id = ?").get(propertyId) as { n: number }).n;
  if (count >= config.maxFilesPerProperty) throw new PropertyError("This property has reached its file limit.");

  const id = randomUUID();
  const key = `${propertyId}/${id}`;
  const dest = localPath(key);
  const temp = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const out = fs.createWriteStream(temp);
  const hash = createHash("sha256");
  let size = 0;
  let head = new Uint8Array(0);
  try {
    const reader = upload.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw tooBig;
      }
      hash.update(value);
      if (head.length < 16) head = new Uint8Array([...head, ...value.slice(0, 16 - head.length)]);
      if (!out.write(value)) await new Promise<void>((resolve) => out.once("drain", () => resolve()));
    }
    // fsync before we record the file, so a power cut can't leave a row pointing at missing bytes.
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    const fd = fs.openSync(temp, "r");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    if (size === 0) throw new PropertyError("The file is empty.");
    if (!matchesSignature(mime, head)) throw new PropertyError("The file's contents don't match its type.");
    fs.renameSync(temp, dest);
  } catch (error) {
    out.destroy();
    fs.rmSync(temp, { force: true });
    fs.rmSync(dest, { force: true });
    throw error;
  }

  const sha256 = hash.digest("hex");
  tx(() => {
    // Re-check: the stage may have moved on while the file was uploading.
    const fresh = propertyRow(propertyId)!;
    if (!canUpload(viewer, fresh, category)) throw new PropertyError("This property moved to another stage while you were uploading.");
    db()
      .prepare(
        `INSERT INTO files (id, property_id, owner_id, category, kind, mime, original_name, size_bytes, sha256,
           storage_key, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, propertyId, ownerId, category, kind, mime, upload.originalName.slice(0, 255) || "upload", size, sha256, key, viewer.id, now());
    db().prepare("UPDATE properties SET updated_at = ? WHERE id = ?").run(now(), propertyId);
    audit({ actorId: viewer.id, action: "file.added", propertyId, details: `${info.label}: ${upload.originalName}` });
  });

  if (await pushRemote(key, mime, sha256)) {
    db().prepare("UPDATE files SET remote_copy = 1 WHERE id = ?").run(id);
  }
  return { id };
}

function fileRow(id: string): FileRow | undefined {
  return db()
    .prepare("SELECT f.*, u.name AS uploaded_by_name FROM files f JOIN users u ON u.id = f.uploaded_by WHERE f.id = ?")
    .get(id) as FileRow | undefined;
}

/** Archives a file: it disappears from normal views but is kept in storage and the record. */
export function archiveFile(viewer: User, fileId: string) {
  tx(() => {
    const f = fileRow(fileId);
    const row = f ? propertyRow(f.property_id) : undefined;
    if (!f || !row || f.archived_at) throw new PropertyError("File not found.");
    if (f.payment_id) throw new PropertyError("Files attached to a payment record can't be removed.");
    if (!canUpload(viewer, row, f.category)) throw new PropertyError("You can't remove this file at this stage.");
    db().prepare("UPDATE files SET archived_at = ?, archived_by = ? WHERE id = ?").run(now(), viewer.id, fileId);
    audit({ actorId: viewer.id, action: "file.archived", propertyId: f.property_id, details: `${CATEGORY_INFO[f.category].label}: ${f.original_name}` });
  });
}

/** The file if this viewer may see it. */
export function viewableFile(viewer: User, fileId: string): FileRow | null {
  const f = fileRow(fileId);
  if (!f || !canSeeFile(viewer.role, f.category)) return null;
  if (f.archived_at && !["admin", "expansion_manager", "founder"].includes(viewer.role)) return null;
  const row = propertyRow(f.property_id);
  return row && canAccess(viewer, row) ? f : null;
}

export async function openFile(f: FileRow) {
  return ensureLocal(f.storage_key);
}

/** Copies any file that isn't in the bucket yet (e.g. after a bucket outage). */
export async function syncPendingFiles(): Promise<{ copied: number; failed: number }> {
  const pending = db().prepare("SELECT id, storage_key, mime, sha256 FROM files WHERE remote_copy = 0 LIMIT 500").all() as {
    id: string;
    storage_key: string;
    mime: string;
    sha256: string;
  }[];
  let copied = 0;
  let failed = 0;
  for (const f of pending) {
    if (await pushRemote(f.storage_key, f.mime, f.sha256)) {
      db().prepare("UPDATE files SET remote_copy = 1 WHERE id = ?").run(f.id);
      copied++;
    } else failed++;
  }
  return { copied, failed };
}

/** Re-hashes every stored file and reports any whose bytes changed or went missing. */
export async function verifyFiles(): Promise<{ checked: number; problems: string[] }> {
  const rows = db().prepare("SELECT id, storage_key, sha256, original_name FROM files").all() as {
    id: string;
    storage_key: string;
    sha256: string;
    original_name: string;
  }[];
  const problems: string[] = [];
  for (const r of rows) {
    const local = await ensureLocal(r.storage_key);
    if (!local) {
      problems.push(`${r.original_name} (${r.id}): missing`);
      continue;
    }
    const hash = createHash("sha256");
    await new Promise<void>((resolve, reject) =>
      fs.createReadStream(local.path).on("data", (c) => hash.update(c)).on("end", resolve).on("error", reject),
    );
    if (hash.digest("hex") !== r.sha256) problems.push(`${r.original_name} (${r.id}): contents changed`);
  }
  return { checked: rows.length, problems };
}

/** Unattached files of a category (e.g. a receipt uploaded just before marking a payment paid). */
export function pendingAttachments(propertyId: number, category: FileCategory): FileRow[] {
  return db()
    .prepare(
      `SELECT f.*, u.name AS uploaded_by_name FROM files f JOIN users u ON u.id = f.uploaded_by
       WHERE f.property_id = ? AND f.category = ? AND f.archived_at IS NULL AND f.payment_id IS NULL ORDER BY f.created_at`,
    )
    .all(propertyId, category) as unknown as FileRow[];
}

export function attachToPayment(fileIds: string[], paymentId: number) {
  const stmt = db().prepare("UPDATE files SET payment_id = ? WHERE id = ?");
  for (const id of fileIds) stmt.run(paymentId, id);
}
