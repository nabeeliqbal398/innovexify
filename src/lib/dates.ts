const DAY = 86_400_000;

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function dayStart(t: number = Date.now()): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Millisecond timestamp for `days` from today at `hour` o'clock. Seeded dates stay relative to the viewer's today. */
export function atOff(days: number, hour = 10): number {
  const d = new Date(dayStart() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** ISO date (yyyy-mm-dd) for `days` from today. */
export function dISO(days: number): string {
  const d = new Date(atOff(days, 12));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoToMs(iso: string): number {
  if (!iso) return 0;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

export function fmtDay(iso: string): string {
  if (!iso) return "—";
  const d = new Date(isoToMs(iso));
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export function fmtAt(ms?: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const h = d.getHours();
  const h12 = h % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h12}:${pad(d.getMinutes())} ${h >= 12 ? "PM" : "AM"}`;
}

export function stamp(): string {
  return fmtAt(Date.now());
}

export function msDay(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function daysFromToday(iso: string): number {
  return Math.round((isoToMs(iso) - atOff(0, 12)) / DAY);
}

export function relDay(iso: string): string {
  const n = daysFromToday(iso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n < 0 ? `${-n} days overdue` : `In ${n} days`;
}

export function ago(ms?: number): string {
  if (!ms) return "—";
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function initials(name?: string): string {
  return (name || "?")
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function plural(n: number, word: string, words?: string): string {
  return `${n} ${n === 1 ? word : (words ?? `${word}s`)}`;
}
