import type { RpcResponse } from "./types.ts";

export interface SubscriberData {
  /** Stable identifier so remove() cannot collide with an unrelated subscriber. */
  id: string;
  userId: string;
  conversationId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  /** requestIds this subscriber currently owns — rejected on disconnect. */
  pendingRequestIds: Set<string>;
}

interface PendingRequest {
  resolve: (res: RpcResponse) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  subscriber: SubscriberData;
  /**
   * Frozen at send-time so a stolen or guessed requestId cannot be answered
   * by a different user's POST to /bridge/respond.
   */
  userId: string;
  conversationId: string;
}

class BridgeRegistry {
  private byConversation = new Map<string, Set<SubscriberData>>();
  private pending = new Map<string, PendingRequest>();

  add(sub: SubscriberData): void {
    const set = this.byConversation.get(sub.conversationId) ?? new Set();
    set.add(sub);
    this.byConversation.set(sub.conversationId, set);
  }

  remove(sub: SubscriberData): void {
    const set = this.byConversation.get(sub.conversationId);
    if (set) {
      set.delete(sub);
      if (set.size === 0) this.byConversation.delete(sub.conversationId);
    }
    for (const requestId of sub.pendingRequestIds) {
      const pending = this.pending.get(requestId);
      if (!pending) continue;
      clearTimeout(pending.timeout);
      this.pending.delete(requestId);
      pending.reject(new Error("Browser disconnected before responding"));
    }
    sub.pendingRequestIds.clear();
  }

  /**
   * Return the most recently added subscriber for a conversation that is
   * *also* owned by `userId`. Filtering by userId is a belt-and-braces check:
   * the subscribe endpoint already rejects mismatched ownership, but we keep
   * the guard so a future bug in that path cannot route another user's RPC.
   */
  pickSubscriber(
    conversationId: string,
    userId: string,
  ): SubscriberData | null {
    const set = this.byConversation.get(conversationId);
    if (!set || set.size === 0) return null;
    const owned = [...set].filter((s) => s.userId === userId);
    return owned.at(-1) ?? null;
  }

  registerPending(
    requestId: string,
    sub: SubscriberData,
    timeoutMs: number,
  ): Promise<RpcResponse> {
    return new Promise<RpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        sub.pendingRequestIds.delete(requestId);
        reject(new Error(`Browser did not respond within ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve,
        reject,
        timeout,
        subscriber: sub,
        userId: sub.userId,
        conversationId: sub.conversationId,
      });
      sub.pendingRequestIds.add(requestId);
    });
  }

  /**
   * Resolve a pending request — but only when the caller owns the original
   * conversation it was issued against. Returns `true` on success, `false`
   * when nothing matched OR when the caller's user/conversation does not
   * match the pending request's owner (prevents cross-conversation replies).
   */
  resolvePending(
    response: RpcResponse,
    caller: { userId: string; conversationId: string },
  ): boolean {
    const pending = this.pending.get(response.requestId);
    if (!pending) return false;
    if (
      pending.userId !== caller.userId ||
      pending.conversationId !== caller.conversationId
    ) {
      return false;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(response.requestId);
    pending.subscriber.pendingRequestIds.delete(response.requestId);
    pending.resolve(response);
    return true;
  }

  sizeOf(conversationId: string): number {
    return this.byConversation.get(conversationId)?.size ?? 0;
  }

  pendingCount(): number {
    return this.pending.size;
  }
}

export const registry = new BridgeRegistry();
