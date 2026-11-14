import { z } from "zod";

/** Keyset cursor over (timestamp, id) — stable under concurrent inserts, unlike OFFSET. */
export type Cursor = { t: string; id: string };

const cursorSchema = z.object({ t: z.iso.datetime({ offset: true }), id: z.uuid() });

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type Page<T> = { items: T[]; nextCursor: string | null };

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const pageQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * Given rows fetched with `limit + 1`, returns the page and the next cursor.
 */
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null };
}

/** PostgREST filter for "strictly older than cursor" on (column, id) descending order. */
export function olderThanFilter(c: Cursor, column = "created_at"): string {
  return `${column}.lt.${c.t},and(${column}.eq.${c.t},id.lt.${c.id})`;
}
