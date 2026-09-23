import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { User } from "@/lib/expansion/types";
import { config } from "./config";
import { deleteMedia, insertMedia, mediaCount, ownEditableProperty, PropertyError } from "./properties";

// Photos and videos are stored on local disk under DATA_DIR/uploads and
// served only through the authenticated /api/media route, never publicly.

export const ALLOWED_TYPES: Record<string, "image" | "video"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/avif": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
};

function filePath(propertyId: number, mediaId: string): string {
  // Ids are server-generated UUIDs, but guard against traversal anyway.
  if (!/^[0-9a-f-]{36}$/.test(mediaId)) throw new Error("Invalid media id");
  return path.join(config.uploadsDir, String(propertyId), mediaId);
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
    case "video/mp4":
    case "video/quicktime":
      return ascii(4, 8) === "ftyp" || ascii(4, 8) === "moov" || ascii(4, 8) === "mdat" || ascii(4, 8) === "wide";
    case "video/webm":
      return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    default:
      return false;
  }
}

export async function saveUpload(
  viewer: User,
  propertyId: number,
  upload: { mime: string; originalName: string; declaredSize: number | null; body: ReadableStream<Uint8Array> },
) {
  const mime = upload.mime.split(";")[0].trim().toLowerCase();
  const kind = ALLOWED_TYPES[mime];
  if (!kind) throw new PropertyError("Only JPEG, PNG, WebP, GIF or AVIF images and MP4, MOV or WebM videos can be uploaded.");
  const limit = kind === "image" ? config.maxImageBytes : config.maxVideoBytes;
  const limitText = `${Math.round(limit / 1024 / 1024)} MB`;
  if (upload.declaredSize !== null && upload.declaredSize > limit) {
    throw new PropertyError(`${kind === "image" ? "Images" : "Videos"} must be ${limitText} or smaller.`);
  }

  // Check permissions before reading the body.
  ownEditableProperty(viewer, propertyId);
  if (mediaCount(propertyId) >= config.maxMediaPerProperty) {
    throw new PropertyError(`A property can have at most ${config.maxMediaPerProperty} photos and videos.`);
  }

  const id = randomUUID();
  const dest = filePath(propertyId, id);
  const temp = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const out = fs.createWriteStream(temp);
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
        throw new PropertyError(`${kind === "image" ? "Images" : "Videos"} must be ${limitText} or smaller.`);
      }
      if (head.length < 16) head = new Uint8Array([...head, ...value.slice(0, 16 - head.length)]);
      if (!out.write(value)) await new Promise<void>((resolve) => out.once("drain", () => resolve()));
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (size === 0) throw new PropertyError("The file is empty.");
    if (!matchesSignature(mime, head)) throw new PropertyError("The file's contents don't match its type.");
    fs.renameSync(temp, dest);
    insertMedia(viewer, propertyId, {
      id,
      kind,
      mime,
      originalName: upload.originalName.slice(0, 255) || "upload",
      sizeBytes: size,
    });
    return { id, kind };
  } catch (error) {
    out.destroy();
    fs.rmSync(temp, { force: true });
    fs.rmSync(dest, { force: true });
    throw error;
  }
}

export function removeUpload(viewer: User, mediaId: string) {
  const propertyId = deleteMedia(viewer, mediaId);
  fs.rmSync(filePath(propertyId, mediaId), { force: true });
}

export function removeFiles(propertyId: number, mediaIds: string[]) {
  for (const id of mediaIds) fs.rmSync(filePath(propertyId, id), { force: true });
  fs.rmSync(path.join(config.uploadsDir, String(propertyId)), { recursive: true, force: true });
}

export function mediaFile(propertyId: number, mediaId: string): { path: string; size: number } | null {
  const p = filePath(propertyId, mediaId);
  try {
    return { path: p, size: fs.statSync(p).size };
  } catch {
    return null;
  }
}
