import { z } from "zod";
import { requireSession } from "../auth/session.ts";
import {
  deleteGeneration,
  getGeneration,
  listGenerations,
  updateGeneration,
} from "../db/generations.ts";
import { deleteUpload, keyFromUrl } from "../storage/local.ts";
import { fromZodError, notFound } from "../lib/http.ts";

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export async function listGenerationsRoute(req: Request): Promise<Response> {
  const authed = await requireSession(req);
  if (authed instanceof Response) return authed;

  const url = new URL(req.url);
  const parsed = ListQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return fromZodError(parsed.error, "Invalid query");

  const page = await listGenerations(authed.user.id, parsed.data);
  return Response.json({ generations: page.items, nextCursor: page.nextCursor });
}

export async function getGenerationRoute(
  req: Request,
  id: string,
): Promise<Response> {
  const authed = await requireSession(req);
  if (authed instanceof Response) return authed;
  const generation = await getGeneration(id, authed.user.id);
  if (!generation) return notFound("Generation");
  return Response.json({ generation });
}

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  code: z.string().min(1).optional(),
  cssCode: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  framework: z.enum(["react-tailwind", "html", "vue"]).optional(),
  thumbnailUrl: z.string().url().optional(),
});

export async function patchGenerationRoute(
  req: Request,
  id: string,
): Promise<Response> {
  const authed = await requireSession(req);
  if (authed instanceof Response) return authed;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fromZodError(parsed.error, "Invalid body");

  const updated = await updateGeneration(id, authed.user.id, parsed.data);
  if (!updated) return notFound("Generation");
  return Response.json({ generation: updated });
}

export async function deleteGenerationRoute(
  req: Request,
  id: string,
): Promise<Response> {
  const authed = await requireSession(req);
  if (authed instanceof Response) return authed;

  const deleted = await deleteGeneration(id, authed.user.id);
  if (!deleted) return notFound("Generation");

  const screenshotUrl = deleted.sourceContext?.screenshotUrl;
  if (screenshotUrl) {
    const key = keyFromUrl(screenshotUrl);
    if (key) await deleteUpload(key);
  }
  return Response.json({ deleted: true });
}
