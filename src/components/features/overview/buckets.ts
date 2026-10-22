import { dayStart, MONTHS } from "@/lib/dates";

const DAY = 86_400_000;

export interface Bucket {
  label: string;
  n: number;
}

/** Counts per calendar month for the last `count` months, oldest first. */
export function monthBuckets<T>(count: number, getAt: (item: T) => number, list: readonly T[]): Bucket[] {
  const now = new Date();
  const out: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    out.push({
      label: MONTHS[start.getMonth()].slice(0, 3),
      n: list.filter((x) => {
        const t = getAt(x);
        return t >= start.getTime() && t < end.getTime();
      }).length,
    });
  }
  return out;
}

/** Counts per 7-day window ending today for the last `count` weeks, oldest first. */
export function weekBuckets<T>(count: number, getAt: (item: T) => number, list: readonly T[]): Bucket[] {
  const end = dayStart() + DAY;
  const out: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const from = end - (i + 1) * 7 * DAY;
    const to = end - i * 7 * DAY;
    const d = new Date(from);
    out.push({
      label: `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`,
      n: list.filter((x) => {
        const t = getAt(x);
        return t >= from && t < to;
      }).length,
    });
  }
  return out;
}
