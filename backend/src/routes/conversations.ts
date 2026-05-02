import { z } from "zod";
import { requireSession } from "../auth/session.ts";
import { getConversation, listConversations } from "../db/conversations.ts";
import { fromZodError, notFound } from "../lib/http.ts";

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export async function listConversationsRoute(req: Request): Promise<Response> {
  const authed = await requireSession(req);
  if (authed instanceof Response) return authed;

  const url = new URL(req.url);
  const parsed = ListQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return fromZodError(parsed.error, "Invalid query");

  const page = await listConversations(authed.user.id, parsed.data);
  return Response.json({ conversations: page.items, nextCursor: page.nextCursor });
}

export async function getConversationRoute(
  req: Request,
  id: string,
): Promise<Response> {
  const authed = await requireSession(req);
  if (authed instanceof Response) return authed;
  const doc = await getConversation(id, authed.user.id);
  if (!doc) return notFound("Conversation");
  return Response.json({
    conversation: {
      id: doc._id.toHexString(),
      skill: doc.skill,
      provider: doc.provider,
      model: doc.model,
      title: doc.title,
      messages: doc.messages.map((m) => ({
        role: m.role,
        content: m.content,
        generationId: m.generationId,
        createdAt: m.createdAt.toISOString(),
      })),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    },
  });
}
