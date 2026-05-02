import { getAuth } from "../auth/instance.ts";
import { getConversation } from "../db/conversations.ts";
import { registry } from "./registry.ts";
import { isRpcResponse } from "./types.ts";

interface RespondBody {
  conversationId: string;
  response: unknown;
}

/**
 * POST /bridge/respond
 *
 * The extension posts RPC responses here. We verify:
 *   1. The caller has a valid session.
 *   2. They own the conversation they claim to be responding on behalf of.
 *   3. The pending request this response addresses was actually issued
 *      against that same (user, conversation) pair — see registry.resolvePending.
 * A response that fails any check is silently dropped (the backend's
 * pending promise will time out) so a hostile extension build cannot probe
 * for valid requestIds by watching which POSTs return 200.
 */
export async function respondRoute(req: Request): Promise<Response> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RespondBody;
  try {
    body = (await req.json()) as RespondBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.conversationId || typeof body.conversationId !== "string") {
    return Response.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }
  if (!isRpcResponse(body.response)) {
    return Response.json(
      { error: "response must be a valid RpcResponse envelope" },
      { status: 400 },
    );
  }

  const conv = await getConversation(body.conversationId, session.user.id);
  if (!conv) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const resolved = registry.resolvePending(body.response, {
    userId: session.user.id,
    conversationId: body.conversationId,
  });
  // `resolved: false` is a normal outcome — the request may have already
  // timed out or been duplicated. Don't leak that to the caller.
  return Response.json({ resolved });
}
