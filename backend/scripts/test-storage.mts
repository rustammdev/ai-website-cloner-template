/**
 * Storage invariants — path traversal, size cap, round-trip, owner extraction.
 * Runs against a temporary STORAGE_DIR so the real storage/ folder is untouched.
 *
 *   node --experimental-strip-types scripts/test-storage.mts
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the module's config at a temp dir BEFORE importing it.
const dir = await mkdtemp(join(tmpdir(), "cloner-storage-"));
process.env.STORAGE_DIR = dir;
process.env.BETTER_AUTH_SECRET ??= "x-placeholder-for-test-suite-only";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";

const {
  saveDataUrl,
  readUpload,
  deleteUpload,
  ownerOfKey,
  keyFromUrl,
  MAX_UPLOAD_BYTES,
} = await import("../src/storage/local.ts");

function tinyPngDataUrl(): string {
  // 1×1 transparent PNG
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUeJxjYgAAAAYAAzY3fKkAAAAASUVORK5CYII=";
  return `data:image/png;base64,${base64}`;
}

async function testRoundTrip() {
  const upload = await saveDataUrl("user-abc", tinyPngDataUrl());
  assert.ok(upload.key.startsWith("user-abc/"), "key starts with owner prefix");
  assert.match(upload.key, /\.png$/);
  assert.ok(upload.url.endsWith(upload.key));
  assert.equal(upload.contentType, "image/png");
  assert.ok(upload.size > 0);

  const read = await readUpload(upload.key);
  assert.ok(read, "stored file is readable");
  assert.equal(read!.contentType, "image/png");
  assert.equal(read!.bytes.length, upload.size);

  await deleteUpload(upload.key);
  const reRead = await readUpload(upload.key);
  assert.equal(reRead, null, "file is gone after delete");
  console.log("✓ save → read → delete round-trip");
}

async function testOwnerExtraction() {
  assert.equal(ownerOfKey("user-abc/x.png"), "user-abc");
  assert.equal(ownerOfKey("no-slash.png"), null);
  assert.equal(keyFromUrl("http://x/storage/user-abc/x.png"), "user-abc/x.png");
  assert.equal(keyFromUrl("http://x/not-storage/y.png"), null);
  console.log("✓ owner + key-from-url helpers");
}

async function testPathTraversal() {
  // The key is generated internally from a uuid, so a caller can't inject
  // traversal via saveDataUrl. But readUpload / deleteUpload accept raw keys
  // and must reject traversal attempts.
  const evil = "../../etc/passwd";
  const read = await readUpload(evil);
  assert.equal(read, null, "traversal key is rejected by readUpload");
  // deleteUpload is a silent no-op for unknown keys — assert it doesn't throw.
  await deleteUpload(evil);
  console.log("✓ path traversal is blocked");
}

async function testInvalidDataUrl() {
  let error: Error | null = null;
  try {
    await saveDataUrl("user-abc", "not a data url");
  } catch (err) {
    error = err as Error;
  }
  assert.ok(error);
  assert.match(error!.message, /Invalid data URL/);
  console.log("✓ invalid data URL is rejected");
}

async function testSizeCap() {
  // Build a data URL larger than MAX_UPLOAD_BYTES.
  const bytes = Buffer.alloc(MAX_UPLOAD_BYTES + 10, 0xff);
  const dataUrl = `data:application/octet-stream;base64,${bytes.toString("base64")}`;
  let error: Error | null = null;
  try {
    await saveDataUrl("user-abc", dataUrl);
  } catch (err) {
    error = err as Error;
  }
  assert.ok(error);
  assert.match(error!.message, /exceeds/);
  console.log("✓ oversize upload is rejected");
}

async function main() {
  try {
    await testRoundTrip();
    await testOwnerExtraction();
    await testPathTraversal();
    await testInvalidDataUrl();
    await testSizeCap();
    console.log("\nall storage tests passed.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("storage test failed:", err);
  rm(dir, { recursive: true, force: true }).finally(() => process.exit(1));
});
