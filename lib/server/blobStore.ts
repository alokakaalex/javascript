import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config";

// Where file bytes live. Every file is written to local disk under
// DATA_DIR/uploads. If an S3-compatible bucket is configured, it is also
// copied there; if the local copy is ever lost, it is restored from the
// bucket on first access. Nothing here ever deletes an object.

let client: S3Client | null = null;

function s3(): S3Client | null {
  const c = config.s3;
  if (!c) return null;
  client ??= new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    forcePathStyle: c.forcePathStyle,
    credentials: c.accessKeyId ? { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } : undefined,
  });
  return client;
}

export function remoteEnabled(): boolean {
  return config.s3 !== null;
}

function remoteKey(key: string): string {
  return `${config.s3!.prefix}/${key}`;
}

export function localPath(key: string): string {
  // Keys are generated server-side ("<propertyId>/<uuid>" or "backups/<name>"); refuse anything else.
  if (!/^(\d+\/[0-9a-f-]{36}|backups\/[\w.-]+)$/.test(key)) throw new Error(`Invalid storage key: ${key}`);
  return key.startsWith("backups/")
    ? path.join(config.backupsDir, key.slice("backups/".length))
    : path.join(config.uploadsDir, key);
}

/** Copies a local file to the bucket. Returns false (never throws) if there is no bucket or the upload failed. */
export async function pushRemote(key: string, mime: string, sha256Hex?: string): Promise<boolean> {
  const client = s3();
  if (!client) return false;
  const file = localPath(key);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.s3!.bucket,
        Key: remoteKey(key),
        Body: fs.createReadStream(file),
        ContentLength: fs.statSync(file).size,
        ContentType: mime,
        Metadata: sha256Hex ? { sha256: sha256Hex } : undefined,
      }),
    );
    return true;
  } catch (error) {
    console.error(`[storage] failed to copy ${key} to the bucket; will retry`, error);
    return false;
  }
}

export async function remoteExists(key: string): Promise<boolean> {
  const client = s3();
  if (!client) return false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: config.s3!.bucket, Key: remoteKey(key) }));
    return true;
  } catch {
    return false;
  }
}

/** Makes sure the file exists locally, downloading it from the bucket if the local copy is missing. */
export async function ensureLocal(key: string): Promise<{ path: string; size: number } | null> {
  const file = localPath(key);
  try {
    return { path: file, size: fs.statSync(file).size };
  } catch {
    // Missing locally: fall through to restore.
  }
  const client = s3();
  if (!client) return null;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: config.s3!.bucket, Key: remoteKey(key) }));
    if (!res.Body) return null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.restore`;
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(temp);
      (res.Body as Readable).pipe(out).on("finish", resolve).on("error", reject);
    });
    fs.renameSync(temp, file);
    console.warn(`[storage] restored ${key} from the bucket`);
    return { path: file, size: fs.statSync(file).size };
  } catch (error) {
    console.error(`[storage] ${key} is missing locally and could not be restored`, error);
    return null;
  }
}
