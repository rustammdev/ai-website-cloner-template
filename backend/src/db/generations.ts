import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./client.ts";
import {
  clampLimit,
  cursorFilter,
  encodeCursor,
  type CursorOptions,
  type CursorPage,
} from "./pagination.ts";
import type {
  Framework,
  Generation,
  GenerationSummary,
  SourceContext,
} from "../lib/types.ts";

/**
 * A "generation" is a saved UI component the AI produced during a chat.
 * Users browse them outside of chat in the dashboard (shadcn-style gallery)
 * and can reopen the conversation that created each one.
 *
 * Versioning strategy for now: updates mutate the row in place
 * (`updateGeneration`). When/if history matters we promote versions into a
 * sibling `generation_versions` collection — the row here becomes the latest
 * pointer.
 */

interface GenerationDoc {
  _id: ObjectId;
  userId: string;
  conversationId: string;
  name: string;
  framework: Framework;
  code: string;
  cssCode?: string;
  dependencies: string[];
  sourceContext?: SourceContext;
  thumbnailUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

async function collection(): Promise<Collection<GenerationDoc>> {
  const db = await getDb();
  const col = db.collection<GenerationDoc>("generations");
  await col.createIndex({ userId: 1, updatedAt: -1 });
  await col.createIndex({ conversationId: 1 });
  return col;
}

function toDetail(doc: GenerationDoc): Generation {
  return {
    id: doc._id.toHexString(),
    userId: doc.userId,
    conversationId: doc.conversationId,
    name: doc.name,
    framework: doc.framework,
    code: doc.code,
    cssCode: doc.cssCode,
    dependencies: doc.dependencies,
    sourceContext: doc.sourceContext,
    thumbnailUrl: doc.thumbnailUrl,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toSummary(doc: GenerationDoc): GenerationSummary {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    framework: doc.framework,
    thumbnailUrl: doc.thumbnailUrl,
    sourceScreenshotUrl: doc.sourceContext?.screenshotUrl,
    conversationId: doc.conversationId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export interface CreateGenerationInput {
  userId: string;
  conversationId: string;
  name: string;
  framework: Framework;
  code: string;
  cssCode?: string;
  dependencies?: string[];
  sourceContext?: SourceContext;
  thumbnailUrl?: string;
}

export async function createGeneration(
  input: CreateGenerationInput,
): Promise<Generation> {
  const col = await collection();
  const now = new Date();
  const doc: GenerationDoc = {
    _id: new ObjectId(),
    userId: input.userId,
    conversationId: input.conversationId,
    name: input.name,
    framework: input.framework,
    code: input.code,
    cssCode: input.cssCode,
    dependencies: input.dependencies ?? [],
    sourceContext: input.sourceContext,
    thumbnailUrl: input.thumbnailUrl,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return toDetail(doc);
}

export async function getGeneration(
  id: string,
  userId: string,
): Promise<Generation | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const doc = await col.findOne({ _id: new ObjectId(id), userId });
  return doc ? toDetail(doc) : null;
}

export async function listGenerations(
  userId: string,
  opts: CursorOptions = {},
): Promise<CursorPage<GenerationSummary>> {
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

export interface UpdateGenerationPatch {
  name?: string;
  code?: string;
  cssCode?: string;
  dependencies?: string[];
  framework?: Framework;
  thumbnailUrl?: string;
}

export async function updateGeneration(
  id: string,
  userId: string,
  patch: UpdateGenerationPatch,
): Promise<Generation | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();

  const set: Partial<GenerationDoc> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.code !== undefined) set.code = patch.code;
  if (patch.cssCode !== undefined) set.cssCode = patch.cssCode;
  if (patch.dependencies !== undefined) set.dependencies = patch.dependencies;
  if (patch.framework !== undefined) set.framework = patch.framework;
  if (patch.thumbnailUrl !== undefined) set.thumbnailUrl = patch.thumbnailUrl;

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: set },
    { returnDocument: "after" },
  );
  return result ? toDetail(result) : null;
}

export async function deleteGeneration(
  id: string,
  userId: string,
): Promise<Generation | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const result = await col.findOneAndDelete({ _id: new ObjectId(id), userId });
  return result ? toDetail(result) : null;
}
