import { ObjectId } from "mongodb";

/**
 * Cursor-based pagination helpers shared by list endpoints.
 *
 * The cursor encodes `(updatedAt, _id)` of the last item on the previous
 * page. Sort is `updatedAt DESC, _id DESC` — `_id` is the tie-breaker so
 * the order is stable even when two docs share a millisecond.
 */

export interface CursorOptions {
  limit?: number;
  cursor?: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CursorPoint {
  updatedAt: Date;
  id: ObjectId;
}

export function encodeCursor(point: CursorPoint): string {
  return Buffer.from(
    `${point.updatedAt.toISOString()}|${point.id.toHexString()}`,
    "utf8",
  ).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPoint | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [iso, hex] = raw.split("|");
    if (!iso || !hex || !ObjectId.isValid(hex)) return null;
    const updatedAt = new Date(iso);
    if (Number.isNaN(updatedAt.getTime())) return null;
    return { updatedAt, id: new ObjectId(hex) };
  } catch {
    return null;
  }
}

export function clampLimit(limit: number | undefined, fallback: number, max = 100): number {
  return Math.min(Math.max(limit ?? fallback, 1), max);
}

/** Build the Mongo filter fragment for "everything strictly after `cursor`". */
export function cursorFilter(cursor: string | undefined): Record<string, unknown> {
  if (!cursor) return {};
  const decoded = decodeCursor(cursor);
  if (!decoded) return {};
  return {
    $or: [
      { updatedAt: { $lt: decoded.updatedAt } },
      { updatedAt: decoded.updatedAt, _id: { $lt: decoded.id } },
    ],
  };
}
