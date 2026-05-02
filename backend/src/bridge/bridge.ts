import { randomUUID } from "node:crypto";
import { registry } from "./registry.ts";
import { pushToSubscriber } from "./stream.ts";
import type {
  RpcMethod,
  RpcRequest,
  RequestChildStylesParams,
  RequestChildStylesResult,
  RequestExactCopyParams,
  RequestExactCopyResult,
  GetFullStylesParams,
  GetFullStylesResult,
  GetStateDiffParams,
  GetStateDiffResult,
  SelectorParams,
  AssetReport,
  DesignTokens,
  BehaviorReport,
  GetSvgsResult,
  GetResponsiveResult,
} from "./types.ts";

/**
 * BrowserBridge is the interface tools use to invoke work in the live page.
 * Each chat request gets its own bridge bound to both the chat's userId AND
 * conversationId, so concurrent chats — even under the same user — never
 * cross-talk, and a rogue extension cannot steer another conversation's RPC.
 */
export interface BrowserBridge {
  /**
   * True when an extension is currently subscribed for this conversation.
   * The runner uses this to decide whether to expose bridge-backed tools to
   * the model at all — if there is no live subscriber, the tool is filtered
   * out of the agent's tool list so the model cannot even try to call it.
   */
  isAvailable(): boolean;
  requestChildStyles(
    params: RequestChildStylesParams,
  ): Promise<RequestChildStylesResult>;
  requestExactCopy(
    params: RequestExactCopyParams,
  ): Promise<RequestExactCopyResult>;
  getFullStyles(params: GetFullStylesParams): Promise<GetFullStylesResult>;
  getStateDiff(params: GetStateDiffParams): Promise<GetStateDiffResult>;
  getAssets(params: SelectorParams): Promise<AssetReport>;
  getDesignTokens(params: SelectorParams): Promise<DesignTokens>;
  getBehaviors(params: SelectorParams): Promise<BehaviorReport>;
  getSvgs(params: SelectorParams): Promise<GetSvgsResult>;
  getResponsive(params: SelectorParams): Promise<GetResponsiveResult>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function createBridge(
  conversationId: string,
  userId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): BrowserBridge {
  async function call<P, R>(method: RpcMethod, params: P): Promise<R> {
    const sub = registry.pickSubscriber(conversationId, userId);
    if (!sub) {
      throw new Error(
        "No active browser connection for this conversation. Open the extension and re-run the request.",
      );
    }

    const requestId = randomUUID();
    const envelope: RpcRequest<P> = {
      type: "request",
      requestId,
      method,
      params,
    };

    const awaited = registry.registerPending(requestId, sub, timeoutMs);
    try {
      pushToSubscriber(sub, envelope);
    } catch {
      throw new Error(
        "Browser connection closed before the request could be sent. Reopen the extension and try again.",
      );
    }
    const response = await awaited;

    if (!response.ok) {
      throw new Error(response.error);
    }
    return response.data as R;
  }

  return {
    isAvailable() {
      return registry.pickSubscriber(conversationId, userId) !== null;
    },
    requestChildStyles(params) {
      return call("request_child_styles", params);
    },
    requestExactCopy(params) {
      return call("request_exact_copy", params);
    },
    getFullStyles(params) {
      return call("get_full_styles", params);
    },
    getStateDiff(params) {
      return call("get_state_diff", params);
    },
    getAssets(params) {
      return call("get_assets", params);
    },
    getDesignTokens(params) {
      return call("get_design_tokens", params);
    },
    getBehaviors(params) {
      return call("get_behaviors", params);
    },
    getSvgs(params) {
      return call("get_svgs", params);
    },
    getResponsive(params) {
      return call("get_responsive", params);
    },
  };
}
