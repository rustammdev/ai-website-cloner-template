import { z } from "zod";
import type { BrowserBridge } from "../bridge/bridge.ts";
import type { ElementContext } from "../lib/types.ts";

/**
 * Per-invocation state tools and middleware read from `runtime.context`.
 * LangChain v1 threads this through via `agent.stream(..., { context })` —
 * replacing the legacy `configurable` bag. Every field is optional so tools
 * that run outside a full session (tests, ad-hoc invocations) don't blow up.
 */
export const AgentContextSchema = z.object({
  userId: z.string().optional(),
  conversationId: z.string().optional(),
  bridge: z.custom<BrowserBridge>().optional(),
  elementContext: z.custom<ElementContext>().optional(),
  /** True when the selected model accepts image inputs. */
  vision: z.boolean().optional(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;
