import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { env } from "../config.ts";

/**
 * Minimal local-disk storage for user uploads (screenshots, thumbnails).
 *
 * Keys are `<ownerId>/<uuid>.<ext>` — the owner prefix is the authoritative
 * source of ownership, checked by the HTTP serve route before streaming bytes
 * back. No external storage concepts leak through: production will replace
 * this file with an S3 / R2 / Supabase adapter exposing the same 3 functions.
 */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB — enough for a full-page PNG

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const EXT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([mime, ext]) => [ext, mime]),
);

export interface StoredUpload {
  /** Stable, URL-safe key. */
  key: string;
  /** Public URL served by GET /storage/<key>. */
  url: string;
  contentType: string;
  size: number;
}

interface ParsedDataUrl {
  mimeType: string;
  bytes: Buffer;
}

function rootDir(): string {
  return resolve(env.STORAGE_DIR);
}

function publicUrl(key: string): string {
  return `${env.BETTER_AUTH_URL}/storage/${key}`;
}

function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1]!;
  const base64 = match[2]!;
  return { mimeType, bytes: Buffer.from(base64, "base64") };
}

/**
 * Resolve a user-supplied key to an absolute filesystem path while blocking
 * path traversal. Rejects any key containing "..", backslashes, or that
 * resolves outside the storage root.
 */
function resolveKeyPath(key: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key) || key.includes("..")) {
    throw new Error("Invalid storage key");
  }
  const root = rootDir();
  const resolved = resolve(root, key);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

export async function saveDataUrl(
  ownerId: string,
  dataUrl: string,
): Promise<StoredUpload> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error("Invalid data URL");
  if (parsed.bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error(`Upload exceeds ${MAX_UPLOAD_BYTES} bytes`);
  }

  const ext = MIME_TO_EXT[parsed.mimeType] ?? "bin";
  const key = `${ownerId}/${randomUUID()}.${ext}`;
  const path = resolveKeyPath(key);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, parsed.bytes);

  return {
    key,
    url: publicUrl(key),
    contentType: parsed.mimeType,
    size: parsed.bytes.length,
  };
}

export async function readUpload(
  key: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  let path: string;
  try {
    path = resolveKeyPath(key);
  } catch {
    return null;
  }
  try {
    const bytes = await readFile(path);
    const ext = extname(key).slice(1).toLowerCase();
    return {
      bytes,
      contentType: EXT_TO_MIME[ext] ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export async function deleteUpload(key: string): Promise<void> {
  let path: string;
  try {
    path = resolveKeyPath(key);
  } catch {
    return;
  }
  try {
    await unlink(path);
  } catch {
    // idempotent — already gone
  }
}

export function ownerOfKey(key: string): string | null {
  const slash = key.indexOf("/");
  return slash > 0 ? key.slice(0, slash) : null;
}

/**
 * When we store a URL and later want to delete the file, extract the key.
 * Returns null if the URL isn't one we issued.
 */
export function keyFromUrl(url: string): string | null {
  const marker = "/storage/";
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return url.slice(idx + marker.length);
}

export { MAX_UPLOAD_BYTES };
