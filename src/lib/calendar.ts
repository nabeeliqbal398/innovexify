import { dISO, fmtDay, isoToMs, MONTHS, relDay } from "@/lib/dates";

export type CalendarTone = "case" | "info" | "warn" | "violet" | "q" | "ok" | "bad";

export interface CalendarItem {
  id: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  title: string;
  /** Short label for the kind, shown in the tooltip and the phone agenda. */
  kind: string;
  tone: CalendarTone;
  onSelect: () => void;
}

export interface CalendarDay {
  iso: string;
  num: number;
  outside: boolean;
  today: boolean;
  label: string;
  items: CalendarItem[];
  more: number;
}

export interface CalendarMonth {
  title: string;
  dow: string[];
  weeks: CalendarDay[][];
  /** Items in the month, oldest first, for the phone agenda. */
  agenda: Array<CalendarItem & { dayLabel: string; rel: string }>;
}

const DAY = 86_400_000;
const pad = (n: number): string => String(n).padStart(2, "0");
const isoOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A Monday-first month grid with up to three items per day, shared by Tasks and the Compliance Calendar. */
export function buildCalendar(offset: number, items: CalendarItem[]): CalendarMonth {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const startDow = (base.getDay() + 6) % 7;
  const start = new Date(base.getFullYear(), base.getMonth(), 1 - startDow);
  const today = dISO(0);
  const weeks: CalendarDay[][] = [];

  for (let w = 0; w < 6; w++) {
    const days: CalendarDay[] = [];
    for (let k = 0; k < 7; k++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + k);
      const iso = isoOf(d);
      const dayItems = items.filter((x) => x.date === iso);
      days.push({
        iso,
        num: d.getDate(),
        outside: d.getMonth() !== base.getMonth(),
        today: iso === today,
        label: `${fmtDay(iso)}${dayItems.length ? `, ${dayItems.length} item${dayItems.length > 1 ? "s" : ""}` : ""}`,
        items: dayItems.slice(0, 3),
        more: Math.max(0, dayItems.length - 3),
      });
    }
    weeks.push(days);
    const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (w + 1) * 7);
    if (w >= 4 && next.getMonth() !== base.getMonth()) break;
  }

  const monthStart = isoToMs(`${base.getFullYear()}-${pad(base.getMonth() + 1)}-01`);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 1).getTime();
  const agenda = items
    .filter((x) => {
      const t = isoToMs(x.date);
      return t >= monthStart - DAY && t < monthEnd;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((x) => ({ ...x, dayLabel: fmtDay(x.date), rel: relDay(x.date) }));

  return {
    title: `${MONTHS[base.getMonth()]} ${base.getFullYear()}`,
    dow: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    weeks,
    agenda,
  };
}
