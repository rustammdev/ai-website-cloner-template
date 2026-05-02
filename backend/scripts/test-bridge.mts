/**
 * Standalone smoke test for the SSE bridge internals.
 * Runs with `node --experimental-strip-types` (no Bun runtime needed) because
 * we only exercise the pure registry + bridge code paths using a stub
 * SubscriberData backed by a fake stream controller.
 *
 * Invoke with: BETTER_AUTH_SECRET=x npx tsx scripts/test-bridge.mts
 * or:          node --experimental-strip-types scripts/test-bridge.mts
 */

import assert from "node:assert/strict";
import { registry, type SubscriberData } from "../src/bridge/registry.ts";
import { createBridge } from "../src/bridge/bridge.ts";
import type { RpcResponse } from "../src/bridge/types.ts";

function makeFakeSubscriber(
  conversationId: string,
  userId = "test-user",
): { sub: SubscriberData; pushed: unknown[] } {
  const pushed: unknown[] = [];
  const decoder = new TextDecoder();
  const controller = {
    enqueue(chunk: Uint8Array) {
      const text = decoder.decode(chunk);
      for (const frame of text.split("\n\n")) {
        if (!frame.startsWith("data:")) continue; // skip `:keepalive`
        const json = frame.slice(5).trim();
        if (json) pushed.push(JSON.parse(json));
      }
    },
    close() {},
    error() {},
  } as unknown as ReadableStreamDefaultController<Uint8Array>;
  const sub: SubscriberData = {
    id: `sub-${Math.random().toString(36).slice(2)}`,
    userId,
    conversationId,
    controller,
    pendingRequestIds: new Set(),
  };
  return { sub, pushed };
}

async function testHappyPath() {
  const cid = "conv-happy";
  const { sub, pushed } = makeFakeSubscriber(cid);
  registry.add(sub);
  const bridge = createBridge(cid, "test-user", 5_000);

  const promise = bridge.requestChildStyles({
    parentSelector: ".root",
    childSelector: "> .child",
  });

  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pushed.length, 1, "exactly one outbound frame");
  const req = pushed[0] as { requestId: string; method: string; params: unknown };
  assert.equal(req.method, "request_child_styles");
  assert.ok(typeof req.requestId === "string" && req.requestId.length > 0);

  const response: RpcResponse = {
    type: "response",
    requestId: req.requestId,
    ok: true,
    data: { styles: { color: "rgb(255,0,0)" } },
  };
  const resolved = registry.resolvePending(response, {
    userId: "test-user",
    conversationId: cid,
  });
  assert.equal(resolved, true, "registry resolved the pending request");

  const result = await promise;
  assert.deepEqual(result, { styles: { color: "rgb(255,0,0)" } });
  assert.equal(registry.pendingCount(), 0, "no pending requests remain");
  registry.remove(sub);
  assert.equal(registry.sizeOf(cid), 0);
  console.log("✓ happy path");
}

async function testTimeout() {
  const cid = "conv-timeout";
  const { sub } = makeFakeSubscriber(cid);
  registry.add(sub);
  const bridge = createBridge(cid, "test-user", 30);

  let error: Error | null = null;
  try {
    await bridge.requestChildStyles({
      parentSelector: ".root",
      childSelector: ".child",
    });
  } catch (err) {
    error = err as Error;
  }
  assert.ok(error, "timeout rejects the promise");
  assert.match(error!.message, /did not respond within/);
  assert.equal(registry.pendingCount(), 0, "timeout cleared pending map");
  assert.equal(sub.pendingRequestIds.size, 0, "timeout cleared subscriber set");
  registry.remove(sub);
  console.log("✓ timeout");
}

async function testDisconnectRejects() {
  const cid = "conv-disconnect";
  const { sub } = makeFakeSubscriber(cid);
  registry.add(sub);
  const bridge = createBridge(cid, "test-user", 60_000);

  const promise = bridge.requestChildStyles({
    parentSelector: ".root",
    childSelector: ".child",
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(registry.pendingCount(), 1);

  registry.remove(sub); // simulate SSE stream close

  let error: Error | null = null;
  try {
    await promise;
  } catch (err) {
    error = err as Error;
  }
  assert.ok(error, "disconnect rejects pending request");
  assert.match(error!.message, /disconnected/i);
  assert.equal(registry.pendingCount(), 0);
  console.log("✓ disconnect rejects pending");
}

async function testNoSubscriber() {
  const bridge = createBridge("conv-does-not-exist", "test-user", 1_000);
  let error: Error | null = null;
  try {
    await bridge.requestChildStyles({
      parentSelector: ".x",
      childSelector: ".y",
    });
  } catch (err) {
    error = err as Error;
  }
  assert.ok(error);
  assert.match(error!.message, /No active browser connection/);
  console.log("✓ no subscriber errors cleanly");
}

async function testErrorResponse() {
  const cid = "conv-err";
  const { sub, pushed } = makeFakeSubscriber(cid);
  registry.add(sub);
  const bridge = createBridge(cid, "test-user", 5_000);

  const promise = bridge.requestChildStyles({
    parentSelector: ".root",
    childSelector: ".child",
  });
  await new Promise((r) => setTimeout(r, 0));
  const req = pushed[0] as { requestId: string };

  registry.resolvePending(
    {
      type: "response",
      requestId: req.requestId,
      ok: false,
      error: "Element not found",
    },
    { userId: "test-user", conversationId: cid },
  );

  let error: Error | null = null;
  try {
    await promise;
  } catch (err) {
    error = err as Error;
  }
  assert.ok(error);
  assert.equal(error!.message, "Element not found");
  registry.remove(sub);
  console.log("✓ error response surfaces as thrown Error");
}

async function testCrossConversationRejection() {
  const cidA = "conv-a";
  const cidB = "conv-b";
  const { sub: subA, pushed: pushedA } = makeFakeSubscriber(cidA, "user-a");
  const { sub: subB } = makeFakeSubscriber(cidB, "user-b");
  registry.add(subA);
  registry.add(subB);
  const bridge = createBridge(cidA, "user-a", 5_000);

  const promise = bridge.requestChildStyles({
    parentSelector: ".r",
    childSelector: ".c",
  });
  await new Promise((r) => setTimeout(r, 0));
  const req = pushedA[0] as { requestId: string };

  // User B tries to resolve User A's request — must be rejected.
  const hijack = registry.resolvePending(
    { type: "response", requestId: req.requestId, ok: true, data: { styles: {} } },
    { userId: "user-b", conversationId: cidB },
  );
  assert.equal(hijack, false, "cross-user resolution rejected");

  // Wrong conversationId under the same user is also rejected.
  const wrongConv = registry.resolvePending(
    { type: "response", requestId: req.requestId, ok: true, data: { styles: {} } },
    { userId: "user-a", conversationId: cidB },
  );
  assert.equal(wrongConv, false, "same user / wrong conversation rejected");

  // Legitimate resolution still works.
  const ok = registry.resolvePending(
    {
      type: "response",
      requestId: req.requestId,
      ok: true,
      data: { styles: { color: "rgb(1,2,3)" } },
    },
    { userId: "user-a", conversationId: cidA },
  );
  assert.equal(ok, true);
  const result = await promise;
  assert.deepEqual(result, { styles: { color: "rgb(1,2,3)" } });

  registry.remove(subA);
  registry.remove(subB);
  console.log("✓ cross-conversation hijack rejected");
}

async function testPickSubscriberFiltersByUser() {
  const cid = "conv-shared";
  const { sub: mine } = makeFakeSubscriber(cid, "user-mine");
  const { sub: other } = makeFakeSubscriber(cid, "user-other");
  registry.add(other); // added first
  registry.add(mine);
  const picked = registry.pickSubscriber(cid, "user-mine");
  assert.ok(picked, "picks the subscriber owned by the caller");
  assert.equal(picked!.userId, "user-mine");
  // Most recently added subscriber for a non-matching user returns null.
  const none = registry.pickSubscriber(cid, "user-ghost");
  assert.equal(none, null, "no subscriber for a non-matching user");
  registry.remove(mine);
  registry.remove(other);
  console.log("✓ pickSubscriber filters by userId");
}

async function main() {
  await testHappyPath();
  await testTimeout();
  await testDisconnectRejects();
  await testNoSubscriber();
  await testErrorResponse();
  await testCrossConversationRejection();
  await testPickSubscriberFiltersByUser();
  console.log("\nall bridge tests passed.");
}

main().catch((err) => {
  console.error("bridge test failed:", err);
  process.exit(1);
});
