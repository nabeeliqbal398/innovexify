"use client";

import { useMemo, useState } from "react";

import { CALENDAR_DOT, MonthCalendar } from "@/components/common/month-calendar";
import { useOpenCase } from "@/components/features/compliance/use-open-case";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Callout, Chip, PageHeader, Segmented } from "@/components/ui/primitives";
import { buildCalendar, type CalendarItem, type CalendarTone } from "@/lib/calendar";
import { dISO } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { useData, useMe } from "@/hooks/useStore";
import { projectById, userName } from "@/store/selectors";

type Kind = "case" | "filing" | "missing" | "task" | "annual";
type Mode = "calendar" | "list";

const KINDS: ReadonlyArray<{ key: Kind; label: string; tone: CalendarTone }> = [
  { key: "case", label: "Case target dates", tone: "case" },
  { key: "filing", label: "Filing follow-ups", tone: "info" },
  { key: "missing", label: "Missing client information", tone: "warn" },
  { key: "task", label: "Compliance tasks", tone: "violet" },
  { key: "annual", label: "Annual report reminders (illustrative)", tone: "q" },
];

const MODES = [
  { value: "calendar", label: "Calendar" },
  { value: "list", label: "List" },
] as const;

const CHASE_AFTER_MS = 7 * 86_400_000;

const pad = (n: number): string => String(n).padStart(2, "0");
function isoOfMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Case targets, filing follow-ups, missing information and compliance tasks on one calendar. */
export function CalendarView({ nav }: ViewProps) {
  const data = useData();
  const me = useMe();
  const openCase = useOpenCase(nav);
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<Mode>("calendar");
  const [hidden, setHidden] = useState<Partial<Record<Kind, boolean>>>({});

  const today = dISO(0);

  const items = useMemo<CalendarItem[]>(() => {
    const out: CalendarItem[] = [];
    const isOn = (k: Kind) => !hidden[k];
    const scoped = data.projects.filter((p) => {
      const c = data.users.find((u) => u.id === p.client);
      return c && c.status !== "Removed" && can(me, "viewClient", c);
    });
    const done = (p: { stageIdx: number; status: string }) => p.stageIdx >= 10 || p.status === "Completed";

    if (isOn("case")) {
      scoped
        .filter((p) => !done(p) && p.deadline)
        .forEach((p) => {
          const late = p.deadline < today;
          out.push({
            id: `case-${p.id}`,
            date: p.deadline,
            title: `${p.id} target · ${userName(data, p.client)}`,
            kind: late ? "Overdue case target" : "Case target date",
            tone: late ? "bad" : "case",
            onSelect: () => openCase(p.id),
          });
        });
    }
    if (isOn("filing")) {
      data.filings
        .filter((f) => f.nextDate && f.status !== "Approved" && f.status !== "Rejected")
        .forEach((f) => {
          const p = projectById(data, f.project);
          out.push({
            id: `filing-${f.id}`,
            date: f.nextDate,
            title: `${f.next} · ${p ? userName(data, p.client) : f.project}`,
            kind: "State filing follow-up",
            tone: f.nextDate < today ? "bad" : "info",
            onSelect: () => nav.go("filings"),
          });
        });
    }
    if (isOn("missing")) {
      data.docs
        .filter((d) => (d.status === "requested" || d.status === "rejected" || d.status === "info") && d.requestedAt)
        .forEach((d) => {
          const date = isoOfMs(d.requestedAt + CHASE_AFTER_MS);
          out.push({
            id: `missing-${d.id}`,
            date,
            title: `Chase: ${d.name} · ${userName(data, d.client)}`,
            kind: "Missing information (7 days after request)",
            tone: date < today ? "bad" : "warn",
            onSelect: () => nav.go("requests", { query: { doc: String(d.id) } }),
          });
        });
    }
    if (isOn("task")) {
      data.tasks
        .filter((t) => t.type === "Compliance" && t.due && !t.done)
        .forEach((t) => {
          const late = t.due < today;
          out.push({
            id: `task-${t.id}`,
            date: t.due,
            title: t.title,
            kind: late ? "Overdue compliance task" : "Compliance task",
            tone: late ? "bad" : "violet",
            onSelect: () => openCase(t.project, "tasks"),
          });
        });
    }
    if (isOn("annual")) {
      data.reminders.forEach((r) => {
        out.push({
          id: `annual-${r.id}`,
          date: r.date,
          title: r.title,
          kind: "Illustrative reminder — confirm the real date with the state",
          tone: "q",
          onSelect: () => openCase(r.project),
        });
      });
    }
    return out;
  }, [data, me, hidden, today, nav, openCase]);

  const month = useMemo(() => buildCalendar(offset, items), [offset, items]);
  const overdue = items.filter((i) => i.date < today).length;

  return (
    <div className="stack-16">
      <PageHeader
        title="Compliance calendar"
        description="Case targets, filing follow-ups, missing information and compliance tasks in one view."
        actions={<Segmented label="View" options={MODES} value={mode} onChange={setMode} />}
      />
      <Callout tone="lock" icon="alert">
        Dates are internal working dates from demo data. Annual report reminders are illustrative and are not legal deadlines until
        confirmed against the state&apos;s own records.
      </Callout>
      <div role="group" aria-label="Show on calendar" className="flex flex-wrap items-center gap-1.5">
        {KINDS.map((k) => (
          <Chip key={k.key} active={!hidden[k.key]} onClick={() => setHidden((h) => ({ ...h, [k.key]: !h[k.key] }))}>
            <span aria-hidden="true" className={cn("size-[9px] rounded-[3px]", CALENDAR_DOT[k.tone])} />
            {k.label}
          </Chip>
        ))}
        {overdue > 0 ? <Badge tone="err">{overdue} overdue</Badge> : null}
      </div>
      <MonthCalendar
        month={month}
        listOnly={mode === "list"}
        onPrev={() => setOffset((o) => o - 1)}
        onNext={() => setOffset((o) => o + 1)}
        onToday={() => setOffset(0)}
        emptyText="Turn on more categories or move to another month."
      />
    </div>
  );
}
