import { randomUUID } from "node:crypto";
import { getAuth } from "../auth/instance.ts";
import { getConversation } from "../db/conversations.ts";
import { registry, type SubscriberData } from "./registry.ts";

const HEARTBEAT_MS = 25_000;

const encoder = new TextEncoder();

function encodeFrame(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * GET /bridge/subscribe?conversationId=...
 *
 * Opens a Server-Sent Events stream the extension listens on for RPC
 * requests. Session + conversation ownership are verified before the stream
 * is created — an extension installed in another user's browser cannot
 * attach to someone else's conversation.
 */
export async function subscribeRoute(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) {
    return Response.json(
      { error: "conversationId query parameter is required" },
      { status: 400 },
    );
  }

  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conv = await getConversation(conversationId, session.user.id);
  if (!conv) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const userId = session.user.id;
  let sub: SubscriberData | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (heartbeat) clearInterval(heartbeat);
    if (sub) registry.remove(sub);
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      sub = {
        id: randomUUID(),
        userId,
        conversationId,
        controller,
        pendingRequestIds: new Set(),
      };
      registry.add(sub);
      controller.enqueue(encodeFrame({ type: "hello", conversationId }));

      // Keep proxies from idle-closing the stream.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:keepalive\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      cleanup();
    },
  });

  req.signal.addEventListener("abort", cleanup);

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable nginx/Cloudflare buffering so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}

export function pushToSubscriber(sub: SubscriberData, payload: unknown): void {
  sub.controller.enqueue(encodeFrame(payload));
}
