import { requireSession } from "../auth/session.ts";
import { ownerOfKey, readUpload } from "../storage/local.ts";

/**
 * Serve a user-owned upload. The key is `<ownerId>/<filename>` and must match
 * the authenticated user — otherwise the response is 403 regardless of the
 * file's actual existence (so we don't leak the presence of foreign keys).
 */
export async function storageRoute(req: Request, key: string): Promise<Response> {
  const authed = await requireSession(req);
  if (authed instanceof Response) return authed;

  if (ownerOfKey(key) !== authed.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = await readUpload(key);
  if (!file) return Response.json({ error: "Not found" }, { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
