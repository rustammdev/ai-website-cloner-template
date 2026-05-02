/**
 * Translator invariants — what the runner emits from synthetic LangGraph
 * stream frames. These translators are the only piece of stream-parsing
 * logic in the agent loop, so a regression here is visible to every client.
 *
 *   node --experimental-strip-types scripts/test-translate.mts
 */

import assert from "node:assert/strict";
import {
  AIMessage,
  AIMessageChunk,
  ToolMessage,
} from "@langchain/core/messages";
import {
  translateMessages,
  translateUpdates,
  extractText,
} from "../src/agent/translate.ts";

function collect<T>(gen: Generator<T>): T[] {
  return Array.from(gen);
}

function testExtractText() {
  assert.equal(extractText("hello"), "hello");
  assert.equal(extractText([{ type: "text", text: "a" }, { type: "text", text: "b" }] as any), "ab");
  assert.equal(extractText([] as any), "");
  console.log("✓ extractText handles string and multimodal arrays");
}

function testTokenStreaming() {
  const chunk = new AIMessageChunk({ content: "Hello " });
  const events = collect(translateMessages([chunk, {}]));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { type: "token", text: "Hello " });

  const empty = collect(translateMessages([new AIMessageChunk({ content: "" }), {}]));
  assert.equal(empty.length, 0, "empty chunks emit nothing");
  console.log("✓ messages mode emits tokens only for non-empty AIMessageChunks");
}

function testToolMessageNotStreamed() {
  // A ToolMessage leaking into messages mode must NOT produce token events.
  const tool = new ToolMessage({
    content: "tool result",
    tool_call_id: "call-1",
    name: "noop",
  });
  const events = collect(translateMessages([tool, {}]));
  assert.equal(events.length, 0);
  console.log("✓ tool messages are not mis-emitted as tokens");
}

function testToolCallsEmitStart() {
  const ai = new AIMessage({
    content: "",
    tool_calls: [
      { id: "c1", name: "map_styles_to_tailwind", args: { styles: {} } },
      { id: "c2", name: "request_child_styles", args: { parentSelector: ".x", childSelector: ".y" } },
    ],
  });
  const events = collect(translateUpdates({ agent: { messages: [ai] } }));
  assert.equal(events.length, 2);
  assert.equal(events[0]!.type, "tool_start");
  assert.equal((events[0] as any).name, "map_styles_to_tailwind");
  assert.equal((events[1] as any).id, "c2");
  console.log("✓ agent node tool_calls emit tool_start events");
}

function testToolEndEmitsEnd() {
  const result = new ToolMessage({
    content: JSON.stringify({ classes: ["p-4"] }),
    tool_call_id: "c1",
    name: "map_styles_to_tailwind",
  });
  const events = collect(translateUpdates({ tools: { messages: [result] } }));
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, "tool_end");
  assert.equal((events[0] as any).name, "map_styles_to_tailwind");
  console.log("✓ tools node ToolMessages emit tool_end events");
}

function testSaveGenerationEmitsGenerationEvent() {
  const result = new ToolMessage({
    content: "Saved \"Primary CTA\" — preview follows.",
    tool_call_id: "c9",
    name: "save_generation",
    artifact: {
      generationId: "abc123",
      name: "Primary CTA",
      framework: "react-tailwind",
    },
  });
  const events = collect(translateUpdates({ tools: { messages: [result] } }));
  assert.equal(events.length, 2, "emits both tool_end and generation");
  assert.equal(events[0]!.type, "tool_end");
  assert.equal(events[1]!.type, "generation");
  assert.equal((events[1] as any).id, "abc123");
  assert.equal((events[1] as any).name, "Primary CTA");
  assert.equal((events[1] as any).framework, "react-tailwind");
  console.log("✓ save_generation result emits both tool_end and generation");
}

function testSaveGenerationErrorDoesNotEmitGeneration() {
  const result = new ToolMessage({
    content: JSON.stringify({ error: "no session" }),
    tool_call_id: "c9",
    name: "save_generation",
    artifact: { error: "no session" },
  });
  const events = collect(translateUpdates({ tools: { messages: [result] } }));
  assert.equal(events.length, 1, "only tool_end when save failed");
  assert.equal(events[0]!.type, "tool_end");
  console.log("✓ failed save_generation does not emit a generation event");
}

function testMissingArtifactDoesNotEmitGeneration() {
  const result = new ToolMessage({
    content: "legacy text only, no artifact",
    tool_call_id: "c9",
    name: "save_generation",
  });
  const events = collect(translateUpdates({ tools: { messages: [result] } }));
  assert.equal(events.length, 1, "only tool_end when artifact missing");
  console.log("✓ missing artifact leaves the event stream unchanged");
}

function testGarbageFramesAreIgnored() {
  assert.deepEqual(collect(translateMessages(undefined)), []);
  assert.deepEqual(collect(translateMessages("hello")), []);
  assert.deepEqual(collect(translateUpdates(null)), []);
  assert.deepEqual(collect(translateUpdates({ unknown: { messages: [] } })), []);
  console.log("✓ garbage frames are ignored (no throws, no events)");
}

function main() {
  testExtractText();
  testTokenStreaming();
  testToolMessageNotStreamed();
  testToolCallsEmitStart();
  testToolEndEmitsEnd();
  testSaveGenerationEmitsGenerationEvent();
  testSaveGenerationErrorDoesNotEmitGeneration();
  testMissingArtifactDoesNotEmitGeneration();
  testGarbageFramesAreIgnored();
  console.log("\nall translator tests passed.");
}

main();
