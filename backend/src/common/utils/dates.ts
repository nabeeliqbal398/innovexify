const DAY_MS = 86_400_000;

/** Today as a calendar date at midnight UTC: the server's date, which is what "overdue" and "not in the future" mean. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/** `YYYY-MM-DD` for a date column, or null. */
export const isoDay = (date: Date | null | undefined): string | null => (date ? date.toISOString().slice(0, 10) : null);
