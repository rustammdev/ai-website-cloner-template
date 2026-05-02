import { z } from "zod";
import { runAgent, type AgentEvent } from "../agent/runner.ts";
import { requireSession } from "../auth/session.ts";
import {
  appendMessages,
  createConversation,
  getConversation,
  type MessageToAppend,
} from "../db/conversations.ts";
import { createBridge } from "../bridge/bridge.ts";
import { logger } from "../lib/logger.ts";
import type { ChatMessage } from "../lib/types.ts";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
});

const BodySchema = z.object({
  skill: z.string().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
  messages: z.array(MessageSchema).min(1),
  conversationId: z.string().optional(),
  context: z
    .object({
      url: z.string().optional(),
      selector: z.string().optional(),
      tagName: z.string().optional(),
      outerHTML: z.string().optional(),
      computedStyles: z.record(z.string()).optional(),
      screenshotDataUrl: z.string().optional(),
      textContent: z.string().optional(),
      className: z.string().optional(),
      attributes: z.record(z.string()).optional(),
      cssVariables: z.record(z.string()).optional(),
      children: z
        .array(
          z.object({
            tagName: z.string(),
            text: z.string().optional(),
            id: z.string().optional(),
            classes: z.string().optional(),
            styles: z.record(z.string()),
          }),
        )
        .optional(),
      animations: z
        .array(
          z.object({
            id: z.string().nullable(),
            type: z.string(),
            playState: z.string(),
            duration: z.union([z.number(), z.string()]).nullable(),
            delay: z.number().nullable(),
            easing: z.string().nullable(),
            iterations: z.number().nullable(),
            keyframes: z.array(z.unknown()),
          }),
        )
        .optional(),
      pseudoElements: z
        .object({
          before: z
            .object({
              content: z.string(),
              styles: z.record(z.string()),
            })
            .optional(),
          after: z
            .object({
              content: z.string(),
              styles: z.record(z.string()),
            })
            .optional(),
        })
        .optional(),
      parentLayout: z
        .object({
          tagName: z.string(),
          selector: z.string(),
          display: z.string(),
          position: z.string(),
          flexDirection: z.string().optional(),
          flexWrap: z.string().optional(),
          justifyContent: z.string().optional(),
          alignItems: z.string().optional(),
          gap: z.string().optional(),
          gridTemplateColumns: z.string().optional(),
          gridTemplateRows: z.string().optional(),
          width: z.string(),
          height: z.string(),
        })
        .optional(),
      paletteSummary: z
        .object({
          colors: z.array(z.string()),
          backgroundColors: z.array(z.string()),
          fontFamilies: z.array(z.string()),
          fontSizes: z.array(z.string()),
          fontWeights: z.array(z.string()),
          borderRadii: z.array(z.string()),
          boxShadows: z.array(z.string()),
          gradients: z.array(z.string()),
        })
        .optional(),
    })
    .optional(),
  stream: z.boolean().optional().default(true),
});

type ChatBody = z.infer<typeof BodySchema>;

export type ChatSseEvent =
  | AgentEvent
  | { type: "conversation"; conversationId: string };

/**
 * Messages the client just sent that are not yet persisted.
 *
 * - On the first turn (no `conversationId`): none — `createConversation`
 *   already wrote the entire opening history, so persisting again would
 *   duplicate it.
 * - On a follow-up turn: only the trailing user messages. Earlier messages
 *   in the payload are history the client is re-sending for context; we
 *   wrote them on their original turn.
 */
function newUserMessagesToPersist(
  messages: ChatMessage[],
  isFollowUp: boolean,
): ChatMessage[] {
  if (!isFollowUp) return [];
  const trailing: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "user") break;
    trailing.unshift(m);
  }
  return trailing;
}

async function resolveConversation(
  body: ChatBody,
  userId: string,
): Promise<{ id: string; isFollowUp: boolean } | Response> {
  if (body.conversationId) {
    const existing = await getConversation(body.conversationId, userId);
    if (!existing) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    return { id: body.conversationId, isFollowUp: true };
  }

  const created = await createConversation({
    userId,
    skill: body.skill,
    provider: body.provider,
    model: body.model,
    messages: body.messages,
  });
  return { id: created._id.toHexString(), isFollowUp: false };
}

async function persistTurn(
  conversationId: string,
  userId: string,
  newUserMessages: ChatMessage[],
  assistantText: string,
  generationId?: string,
): Promise<void> {
  const messages: MessageToAppend[] = [...newUserMessages];
  if (assistantText) {
    messages.push({
      role: "assistant",
      content: assistantText,
      ...(generationId ? { generationId } : {}),
    });
  }
  if (messages.length) await appendMessages(conversationId, userId, messages);
}

function toSseResponse(events: AsyncIterable<ChatSseEvent>): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (evt: ChatSseEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      try {
        for await (const evt of events) enqueue(evt);
      } catch (err) {
        enqueue({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function chatRoute(req: Request): Promise<Response> {
  const authed = await requireSession(req);
  if (authed instanceof Response) return authed;

  let body: ChatBody;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid request body" },
      { status: 400 },
    );
  }

  const preview = (value: string | undefined, max = 240) => {
    if (!value) return null;
    const compact = value.replaceAll("\n", " ").replaceAll(/\s+/g, " ").trim();
    return compact.length > max ? `${compact.slice(0, max)}…` : compact;
  };
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  const ctx = body.context;
  logger.info("chat request (incoming)", {
    skill: body.skill,
    provider: body.provider ?? null,
    model: body.model ?? null,
    stream: body.stream,

    messagesCount: body.messages.length,
    lastUserLen: lastUser?.content?.length ?? 0,
    lastUserPreview: preview(lastUser?.content, 240),

    contextPresent: Boolean(ctx),
    url: ctx?.url ?? null,
    selector: ctx?.selector ?? null,
    tagName: ctx?.tagName ?? null,

    outerHTMLLen: ctx?.outerHTML?.length ?? 0,
    outerHTMLPreview: preview(ctx?.outerHTML, 240),

    computedStylesKeys: ctx?.computedStyles
      ? Object.keys(ctx.computedStyles).length
      : 0,

    childrenCount: ctx?.children?.length ?? 0,
    animationsCount: ctx?.animations?.length ?? 0,
    pseudoBeforePresent: Boolean(ctx?.pseudoElements?.before),
    pseudoAfterPresent: Boolean(ctx?.pseudoElements?.after),
    palettePresent: Boolean(ctx?.paletteSummary),
    parentLayoutPresent: Boolean(ctx?.parentLayout),
    cssVariablesKeys: ctx?.cssVariables ? Object.keys(ctx.cssVariables).length : 0,

    screenshotPresent: Boolean(ctx?.screenshotDataUrl),
    screenshotLen: ctx?.screenshotDataUrl?.length ?? 0,
  });

  const userId = authed.user.id;
  const conv = await resolveConversation(body, userId);
  if (conv instanceof Response) return conv;
  const conversationId = conv.id;

  const userMessagesToPersist = newUserMessagesToPersist(body.messages, conv.isFollowUp);
  const bridge = createBridge(conversationId, userId);
  const agentEvents = runAgent({
    skillName: body.skill,
    provider: body.provider,
    modelId: body.model,
    messages: body.messages,
    context: body.context,
    bridge,
    userId,
    conversationId,
  });

  if (!body.stream) {
    let finalText = "";
    let generationId: string | undefined;
    for await (const evt of agentEvents) {
      if (evt.type === "token") finalText += evt.text;
      if (evt.type === "generation") generationId = evt.id;
      if (evt.type === "error") {
        logger.warn("chat non-stream: agent returned error", {
          conversationId,
          userId,
          message: evt.message,
        });
        // Persist the user's messages anyway so the UI can reflect what was
        // sent; skip the empty assistant slot — a failed turn leaves no reply.
        await persistTurn(conversationId, userId, userMessagesToPersist, "");
        return Response.json(
          { error: evt.message, conversationId },
          { status: 500 },
        );
      }
    }
    await persistTurn(
      conversationId,
      userId,
      userMessagesToPersist,
      finalText,
      generationId,
    );
    return Response.json({ conversationId, content: finalText, generationId });
  }

  async function* sseEvents(): AsyncGenerator<ChatSseEvent> {
    yield { type: "conversation", conversationId };
    // The extension only subscribes to the bridge after receiving the
    // conversationId event. Give it a short window to connect so early tool
    // calls (get_behaviors/get_full_styles/request_exact_copy) don't fail
    // spuriously and cause the model to proceed "shallow".
    if (body.context && !bridge.isAvailable()) {
      const start = Date.now();
      while (!bridge.isAvailable() && Date.now() - start < 1500) {
        await sleep(50);
      }
      logger.debug("bridge availability after initial wait", {
        conversationId,
        available: bridge.isAvailable(),
        waitedMs: Date.now() - start,
      });
    }
    let finalText = "";
    let generationId: string | undefined;
    let errored = false;
    for await (const evt of agentEvents) {
      if (evt.type === "token") finalText += evt.text;
      if (evt.type === "generation") generationId = evt.id;
      if (evt.type === "error") {
        errored = true;
        logger.warn("chat stream: agent returned error", {
          conversationId,
          userId,
          message: evt.message,
        });
      }
      yield evt;
    }
    // If the turn errored before producing any text, don't leave a blank
    // assistant row — persist the user's messages only.
    await persistTurn(
      conversationId,
      userId,
      userMessagesToPersist,
      errored && !finalText ? "" : finalText,
      generationId,
    );
  }

  return toSseResponse(sseEvents());
}
