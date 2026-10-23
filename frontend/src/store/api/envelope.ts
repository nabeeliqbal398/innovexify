import type { Cursored, CursorMeta, Paged, PageMeta, SuccessEnvelope } from "@/types/api";

/** The body of any success response, whatever its meta. */
export type Env<T, M = undefined> = SuccessEnvelope<T, M>;

export const unwrap = <T>(env: Env<T>): T => env.data;

const EMPTY_PAGE: PageMeta = { page: 1, limit: 0, total: 0, totalPages: 1 };

export function toPage<A, V>(env: Env<A[], PageMeta>, map: (item: A) => V): Paged<V> {
  return { items: (env.data ?? []).map(map), meta: env.meta ?? EMPTY_PAGE };
}

const EMPTY_CURSOR: CursorMeta = { limit: 0, hasMore: false, nextBefore: null, newest: null };

export function toCursor<A, V>(env: Env<A[], CursorMeta>, map: (item: A) => V): Cursored<V> {
  return { items: (env.data ?? []).map(map), meta: env.meta ?? EMPTY_CURSOR };
}

/** Query-string for a params object: undefined, null and "" are dropped, so the server's defaults apply. */
export function params(values: Record<string, string | number | boolean | undefined | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = String(v);
  }
  return out;
}
