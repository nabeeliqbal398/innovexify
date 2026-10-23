/** Small helpers shared by the mappers. */

/** A timestamp from the API (ISO 8601) as milliseconds, which is what the screens format. `undefined` for none or nonsense. */
export function toMs(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : t;
}

/**
 * A calendar date from the API (`YYYY-MM-DD`, possibly with a time part) as the plain `YYYY-MM-DD` string. It is only ever cut
 * and passed on as text, never turned into a `Date`, so no timezone can shift it by a day. "" for none.
 */
export function toDay(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export interface Ref {
  id: string;
  name: string;
}

export const refId = (r: Ref | null | undefined): string => r?.id ?? "";
export const refName = (r: Ref | null | undefined): string => r?.name ?? "—";
