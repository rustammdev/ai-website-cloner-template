import {
  AIMessage,
  AIMessageChunk,
  ToolMessage,
  type BaseMessage,
  type MessageContent,
} from "@langchain/core/messages";

export type AgentEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; id?: string; name: string; args: unknown }
  | { type: "tool_end"; id?: string; name: string; content: string }
  | { type: "generation"; id: string; name: string; framework: string }
  | { type: "done" }
  | { type: "error"; message: string };

export function extractText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && "text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("");
}

/**
 * `save_generation` declares `responseFormat: "content_and_artifact"` — the
 * structured payload lands on `ToolMessage.artifact` so we can surface the
 * generation event without re-parsing JSON out of the text content.
 */
function readGenerationArtifact(
  msg: ToolMessage,
): { id: string; name: string; framework: string } | null {
  const artifact = msg.artifact as
    | { generationId?: string; name?: string; framework?: string; error?: string }
    | undefined;
  if (!artifact || typeof artifact !== "object") return null;
  if (typeof artifact.generationId !== "string") return null;
  return {
    id: artifact.generationId,
    name: typeof artifact.name === "string" ? artifact.name : "",
    framework: typeof artifact.framework === "string" ? artifact.framework : "",
  };
}

export function* translateMessages(frame: unknown): Generator<AgentEvent> {
  if (!Array.isArray(frame)) return;
  const [msg] = frame;
  if (!(msg instanceof AIMessageChunk)) return;
  const text = extractText(msg.content);
  if (text) yield { type: "token", text };
}

export function* translateUpdates(frame: unknown): Generator<AgentEvent> {
  if (!frame || typeof frame !== "object") return;
  const nodes = frame as Record<string, { messages?: BaseMessage[] } | undefined>;

  const agentDelta = nodes.agent?.messages;
  if (agentDelta?.length) {
    const last = agentDelta[agentDelta.length - 1];
    if (last instanceof AIMessage) {
      for (const call of last.tool_calls ?? []) {
        yield { type: "tool_start", id: call.id, name: call.name, args: call.args };
      }
    }
  }

  const toolDelta = nodes.tools?.messages;
  if (toolDelta?.length) {
    for (const m of toolDelta) {
      if (!(m instanceof ToolMessage)) continue;
      const name = m.name ?? "";
      const content = extractText(m.content);
      yield { type: "tool_end", id: m.tool_call_id, name, content };
      if (name === "save_generation") {
        const gen = readGenerationArtifact(m);
        if (gen) yield { type: "generation", ...gen };
      }
    }
  }
}
