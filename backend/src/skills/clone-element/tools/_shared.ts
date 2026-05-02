import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import type { BrowserBridge } from "../../../bridge/bridge.ts";
import type { ElementContext } from "../../../lib/types.ts";
import type { AgentContext } from "../../../agent/context.ts";

/**
 * LangChain v1 exposes per-invocation data as `config.context`, but the type
 * exported from `@langchain/core/runnables` doesn't yet declare it. Intersect
 * so TypeScript sees the field without losing the rest of RunnableConfig.
 */
type ToolConfig = RunnableConfig & { context?: AgentContext };

export function getBag(config?: ToolConfig): AgentContext {
  return config?.context ?? {};
}

export function toolError(message: string): string {
  // Keep a consistent structured shape so the model can detect non-retryable
  // failures (e.g. missing bridge) and proceed instead of looping.
  return JSON.stringify({ ok: false, error: message, retryable: false });
}

export const BRIDGE_UNAVAILABLE_MSG =
  "Browser bridge unavailable. Do NOT retry bridge tools. Proceed with the outerHTML/computedStyles already in context and make best-effort assumptions for anything missing.";

export const NO_SELECTOR_MSG =
  "No selector available — the user has not picked an element and no selector was provided.";

const MAX_RESULT_CHARS = 80_000;

function clampResult(serialised: string, note: string): string {
  if (serialised.length <= MAX_RESULT_CHARS) return serialised;
  return `${serialised.slice(0, MAX_RESULT_CHARS)}\n/* truncated: ${note}; original ${serialised.length} chars */`;
}

export async function runBridge<R>(
  bridge: BrowserBridge | undefined,
  fn: (b: BrowserBridge) => Promise<R>,
  truncationNote = "response too large",
): Promise<string> {
  if (!bridge || !bridge.isAvailable()) {
    return toolError(BRIDGE_UNAVAILABLE_MSG);
  }
  try {
    const result = await fn(bridge);
    return clampResult(JSON.stringify(result), truncationNote);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Bridge errors are typically transient (tab navigated, selector missing,
    // extension unsubscribed). Mark non-retryable to prevent the agent from
    // burning its call budget in tight loops.
    return toolError(`Bridge error: ${message}`);
  }
}

export function pickedSelector(ctx?: ElementContext): string | null {
  const s = ctx?.selector;
  return s && s.trim().length > 0 ? s : null;
}

export interface ToolMeta {
  /** Tool calls through the browser bridge — filtered out when no subscriber. */
  requiresBridge: boolean;
  /** Per-run cap enforced via toolCallLimitMiddleware. */
  runLimit?: number;
}

export interface DefinedTool {
  tool: StructuredToolInterface;
  meta: ToolMeta;
}

export function defineTool(
  tool: StructuredToolInterface,
  meta: ToolMeta,
): DefinedTool {
  return { tool, meta };
}

export function noInputBridgeTool<R>(opts: {
  name: string;
  description: string;
  runLimit?: number;
  call: (bridge: BrowserBridge, selector: string) => Promise<R>;
}): DefinedTool {
  return defineTool(
    tool(
      async (_, config) => {
        const { bridge, elementContext } = getBag(config);
        const selector = pickedSelector(elementContext);
        if (!selector) return toolError(NO_SELECTOR_MSG);
        return runBridge(bridge, (b) => opts.call(b, selector));
      },
      {
        name: opts.name,
        description: opts.description,
        schema: z.object({}),
      },
    ),
    { requiresBridge: true, runLimit: opts.runLimit },
  );
}
