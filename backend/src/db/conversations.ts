import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./client.ts";
import {
  clampLimit,
  cursorFilter,
  encodeCursor,
  type CursorOptions,
  type CursorPage,
} from "./pagination.ts";
import type { ChatMessage } from "../lib/types.ts";

export interface StoredMessage extends ChatMessage {
  createdAt: Date;
  /** Set on assistant messages that produced a saved generation. */
  generationId?: string;
}

export type MessageToAppend = ChatMessage & { generationId?: string };

export interface ConversationDoc {
  _id: ObjectId;
  userId: string;
  skill: string;
  provider?: string;
  model?: string;
  title: string;
  messages: StoredMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationSummary {
  id: string;
  skill: string;
  provider?: string;
  model?: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

async function collection(): Promise<Collection<ConversationDoc>> {
  const db = await getDb();
  const col = db.collection<ConversationDoc>("conversations");
  await col.createIndex({ userId: 1, updatedAt: -1 });
  return col;
}

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const raw = firstUser?.content.trim() ?? "New conversation";
  return raw.length > 80 ? `${raw.slice(0, 77)}…` : raw;
}

function toSummary(doc: ConversationDoc): ConversationSummary {
  return {
    id: doc._id.toHexString(),
    skill: doc.skill,
    provider: doc.provider,
    model: doc.model,
    title: doc.title,
    messageCount: doc.messages.length,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function stamp(messages: MessageToAppend[], now: Date): StoredMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    createdAt: now,
    ...(m.generationId ? { generationId: m.generationId } : {}),
  }));
}

export async function createConversation(input: {
  userId: string;
  skill: string;
  provider?: string;
  model?: string;
  messages: MessageToAppend[];
}): Promise<ConversationDoc> {
  const col = await collection();
  const now = new Date();
  const doc: ConversationDoc = {
    _id: new ObjectId(),
    userId: input.userId,
    skill: input.skill,
    provider: input.provider,
    model: input.model,
    title: deriveTitle(input.messages),
    messages: stamp(input.messages, now),
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return doc;
}

export async function appendMessages(
  conversationId: string,
  userId: string,
  messages: MessageToAppend[],
): Promise<void> {
  if (!messages.length) return;
  const col = await collection();
  const now = new Date();
  await col.updateOne(
    { _id: new ObjectId(conversationId), userId },
    {
      $push: { messages: { $each: stamp(messages, now) } },
      $set: { updatedAt: now },
    },
  );
}

export async function getConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationDoc | null> {
  if (!ObjectId.isValid(conversationId)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(conversationId), userId });
}

export async function listConversations(
  userId: string,
  opts: CursorOptions = {},
): Promise<CursorPage<ConversationSummary>> {
  const limit = clampLimit(opts.limit, 50);
  const col = await collection();

  const filter = { userId, ...cursorFilter(opts.cursor) };
  const docs = await col
    .find(filter, { sort: { updatedAt: -1, _id: -1 }, limit: limit + 1 })
    .toArray();

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor({ updatedAt: last.updatedAt, id: last._id }) : null;

  return { items: page.map(toSummary), nextCursor };
}
