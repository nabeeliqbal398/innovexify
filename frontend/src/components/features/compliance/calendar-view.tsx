"use client";

import { useMemo, useState } from "react";

import { ErrorState } from "@/components/common/query-state";
import { CALENDAR_DOT, MonthCalendar } from "@/components/common/month-calendar";
import { useOpenCase } from "@/components/features/compliance/use-open-case";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Callout, Chip, PageHeader, Segmented } from "@/components/ui/primitives";
import { buildCalendar, type CalendarItem, type CalendarTone } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import type { CalendarKind } from "@/lib/api-mappers";
import { useCalendarQuery } from "@/store/api/filings";

type Mode = "calendar" | "list";

const KINDS: ReadonlyArray<{ key: CalendarKind; label: string; tone: CalendarTone }> = [
  { key: "case", label: "Case target dates", tone: "case" },
  { key: "filing", label: "Filing follow-ups", tone: "info" },
  { key: "missing", label: "Missing client information", tone: "warn" },
  { key: "task", label: "Compliance tasks", tone: "violet" },
  { key: "reminder", label: "Annual report reminders (illustrative)", tone: "q" },
];

const MODES = [
  { value: "calendar", label: "Calendar" },
  { value: "list", label: "List" },
] as const;

const pad = (n: number): string => String(n).padStart(2, "0");
const isoOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The days the month grid for `offset` shows: from its first Monday-start cell to the last cell of its 6 weeks. */
function gridWindow(offset: number): { from: string; to: string } {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const startDow = (base.getDay() + 6) % 7;
  const start = new Date(base.getFullYear(), base.getMonth(), 1 - startDow);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41);
  return { from: isoOf(start), to: isoOf(end) };
}

/** Case targets, filing follow-ups, missing information and compliance tasks on one calendar, from `GET /calendar`. */
export function CalendarView({ nav }: ViewProps) {
  const openCase = useOpenCase(nav);
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<Mode>("calendar");
  const [hidden, setHidden] = useState<Partial<Record<CalendarKind, boolean>>>({});
  const range = useMemo(() => gridWindow(offset), [offset]);
  const result = useCalendarQuery(range);

  const items = useMemo<CalendarItem[]>(() => {
    const out: CalendarItem[] = [];
    for (const i of result.data?.items ?? []) {
      if (hidden[i.kind]) continue;
      const who = i.clientName ?? "";
      const base = { id: i.key, date: i.date };
      if (i.kind === "case") {
        out.push({ ...base, title: `${i.caseDisplay} target · ${who}`, kind: i.overdue ? "Overdue case target" : "Case target date", tone: i.overdue ? "bad" : "case", onSelect: () => i.caseId && openCase(i.caseId) });
      } else if (i.kind === "filing") {
        out.push({ ...base, title: `${i.title} · ${who}`, kind: "State filing follow-up", tone: i.overdue ? "bad" : "info", onSelect: () => nav.go("filings") });
      } else if (i.kind === "missing") {
        out.push({
          ...base,
          title: `Chase: ${i.title} · ${who}`,
          kind: "Missing information (7 days after request)",
          tone: i.overdue ? "bad" : "warn",
          onSelect: () => nav.go("requests", { query: { doc: i.documentId ?? undefined } }),
        });
      } else if (i.kind === "task") {
        out.push({ ...base, title: i.title, kind: i.overdue ? "Overdue compliance task" : "Compliance task", tone: i.overdue ? "bad" : "violet", onSelect: () => i.caseId && openCase(i.caseId, "tasks") });
      } else {
        out.push({ ...base, title: i.title, kind: "Illustrative reminder — confirm the real date with the state", tone: "q", onSelect: () => i.caseId && openCase(i.caseId) });
      }
    }
    return out;
  }, [result.data, hidden, nav, openCase]);

  const month = useMemo(() => buildCalendar(offset, items), [offset, items]);
  const overdue = result.data?.overdueTotal ?? 0;

  return (
    <div className="stack-16">
      <PageHeader
        title="Compliance calendar"
        description="Case targets, filing follow-ups, missing information and compliance tasks in one view."
        actions={<Segmented label="View" options={MODES} value={mode} onChange={setMode} />}
      />
      <Callout tone="lock" icon="alert">
        Dates are internal working dates. Annual report reminders are illustrative and are not legal deadlines until confirmed against the
        state&apos;s own records.
      </Callout>
      <div role="group" aria-label="Show on calendar" className="flex flex-wrap items-center gap-1.5">
        {KINDS.map((k) => (
          <Chip key={k.key} active={!hidden[k.key]} onClick={() => setHidden((h) => ({ ...h, [k.key]: !h[k.key] }))}>
            <span aria-hidden="true" className={cn("size-[9px] rounded-[3px]", CALENDAR_DOT[k.tone])} />
            {k.label}
          </Chip>
        ))}
        {overdue > 0 ? <Badge tone="err">{overdue} overdue</Badge> : null}
        {result.isFetching && !result.isLoading ? <span className="help">Updating…</span> : null}
      </div>
      {result.isError ? <ErrorState error={result.error} onRetry={() => void result.refetch()} title="We could not load the calendar" /> : null}
      {result.data?.truncated ? (
        <Callout tone="info" icon="alert" role="status">
          This month has more than 500 dated items of one kind, so some are not shown. Narrow it down from the tracker or the cases list.
        </Callout>
      ) : null}
      <div aria-busy={result.isLoading || undefined} className={cn(result.isLoading && "opacity-60")}>
        <MonthCalendar
          month={month}
          listOnly={mode === "list"}
          onPrev={() => setOffset((o) => o - 1)}
          onNext={() => setOffset((o) => o + 1)}
          onToday={() => setOffset(0)}
          emptyText="Turn on more categories or move to another month."
        />
      </div>
    </div>
  );
}
