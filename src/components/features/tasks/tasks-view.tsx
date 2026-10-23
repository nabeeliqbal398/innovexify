"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { useOpenCase } from "@/components/features/projects/use-open-case";
import { NewTaskDialog } from "@/components/features/tasks/new-task-dialog";
import { TaskDrawer } from "@/components/features/tasks/task-drawer";
import { TaskTable } from "@/components/features/tasks/task-table";
import type { ViewProps } from "@/components/features/workspace/types";
import { MonthCalendar, CALENDAR_DOT } from "@/components/common/month-calendar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Chip, Count, Segmented } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/constants/vocab";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useStore";
import { isDone } from "@/lib/api-mappers";
import { buildCalendar, type CalendarItem } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { useCasesQuery, useTasksQuery, type ListTasksParams } from "@/store/api/cases";
import { useDirectoryQuery } from "@/store/api/people";

type Mode = "list" | "calendar";
type Whose = "mine" | "team";
type DueFilter = "open" | "overdue" | "today" | "upcoming" | "done";

const PAGE_SIZE = 10;
const MODES = [
  { value: "list", label: "List" },
  { value: "calendar", label: "Calendar" },
] as const;

const FILTERS: ReadonlyArray<{ id: DueFilter; label: string; params: ListTasksParams }> = [
  { id: "open", label: "All open", params: { done: false } },
  { id: "overdue", label: "Overdue", params: { filter: "overdue" } },
  { id: "today", label: "Due today", params: { filter: "today" } },
  { id: "upcoming", label: "Upcoming", params: { filter: "upcoming" } },
  { id: "done", label: "Completed", params: { done: true } },
];

const LEGEND = [
  ["info", "Task"],
  ["bad", "Overdue"],
  ["ok", "Done"],
  ["case", "Case target"],
] as const;

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** The days the calendar grid for `offset` months from now shows, with a week of slack either side (UTC dates). */
function gridRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { from: iso(new Date(first.getTime() - 7 * 86_400_000)), to: iso(new Date(last.getTime() + 7 * 86_400_000)) };
}

function Chips({ filter, setFilter, base, setPage }: { filter: DueFilter; setFilter: (f: DueFilter) => void; base: ListTasksParams; setPage: (n: number) => void }) {
  return (
    <div role="group" aria-label="Due filter" className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => (
        <FilterChip
          key={f.id}
          label={f.label}
          active={filter === f.id}
          params={{ ...base, ...f.params }}
          onClick={() => {
            setFilter(f.id);
            setPage(1);
          }}
        />
      ))}
    </div>
  );
}

function FilterChip({ label, active, params, onClick }: { label: string; active: boolean; params: ListTasksParams; onClick: () => void }) {
  const count = useTasksQuery({ ...params, limit: 1 });
  return (
    <Chip active={active} onClick={onClick}>
      {label} <Count>{count.data?.meta.total ?? "…"}</Count>
    </Chip>
  );
}

export function TasksView({ nav }: ViewProps) {
  const me = useMe();
  const openCase = useOpenCase(nav);
  const [mode, setMode] = useState<Mode>("list");
  const [whose, setWhose] = useState<Whose>("team");
  const [filter, setFilter] = useState<DueFilter>(FILTERS.find((f) => f.id === nav.param("filter"))?.id ?? "open");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [month, setMonth] = useState(0);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(nav.param("new") === "1");
  const search = useDebounced(query.trim(), 300);
  const staff = useDirectoryQuery().data ?? [];

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const taskId = nav.param("task") || null;
  const mineParam: ListTasksParams = whose === "mine" ? { assigneeId: me.id } : {};
  const base: ListTasksParams = { ...mineParam, ...(assignee ? { assigneeId: assignee } : {}), ...(search ? { search } : {}) };

  const list = useTasksQuery({ ...base, ...active.params, page, limit: PAGE_SIZE, sort: "due", order: filter === "done" ? "desc" : "asc" }, { skip: mode !== "list" });
  const myOpen = useTasksQuery({ assigneeId: me.id, done: false, limit: 1 });
  const teamOpen = useTasksQuery({ done: false, limit: 1 });
  const rows = list.data?.items ?? [];
  const meta = list.data?.meta;

  const range = gridRange(month);
  const calTasks = useTasksQuery({ ...mineParam, dueFrom: range.from, dueTo: range.to, limit: 100, sort: "due" } as ListTasksParams, { skip: mode !== "calendar" });
  const calCases = useCasesQuery({ deadlineFrom: range.from, deadlineTo: range.to, limit: 100, sort: "deadline", order: "asc" }, { skip: mode !== "calendar" });

  const openTask = (id: string) => nav.setParams({ task: id });
  const calendarItems: CalendarItem[] = [
    ...(calTasks.data?.items ?? [])
      .filter((t) => t.due)
      .map((t): CalendarItem => ({
        id: `task-${t.id}`,
        date: t.due,
        title: t.title,
        kind: t.done ? "Done" : t.overdue ? "Overdue" : "Task",
        tone: t.done ? "ok" : t.overdue ? "bad" : "info",
        onSelect: () => openTask(t.id),
      })),
    ...(calCases.data?.items ?? [])
      .filter((p) => p.deadline && !isDone(p))
      .map(
        (p): CalendarItem => ({
          id: `case-${p.apiId}`,
          date: p.deadline,
          title: `${p.id} target · ${p.clientName}`,
          kind: "Case target",
          tone: "case",
          onSelect: () => openCase(p.apiId),
        }),
      ),
  ];

  const emptyText =
    whose === "mine" && !search && !assignee
      ? "No tasks are assigned to you in this view. Switch to Team tasks to see everyone's work."
      : "No tasks match these filters.";

  return (
    <div className="stack-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Tasks &amp; deadlines</h1>
          <p className="help">Internal work across every case. Internal tasks never appear in the client portal.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented options={MODES} value={mode} onChange={setMode} label="View" />
          {can(me, "manageTasks") ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Icon name="plus" small />
              New task
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          tabs
          label="Whose tasks"
          value={whose}
          onChange={(w) => {
            setWhose(w);
            setPage(1);
          }}
          options={[
            { value: "mine", label: `My tasks ${myOpen.data?.meta.total ?? ""}`.trim() },
            { value: "team", label: `Team tasks ${teamOpen.data?.meta.total ?? ""}`.trim() },
          ]}
        />
        {mode === "list" ? <Chips filter={filter} setFilter={setFilter} base={base} setPage={setPage} /> : null}
      </div>
      {mode === "list" ? (
        <section className="card overflow-hidden">
          <div className="card-h">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input
                type="search"
                aria-label="Search tasks"
                placeholder="Search task, case or client"
                className="w-[240px]"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              <Select
                aria-label="Filter by assignee"
                className="w-auto"
                value={assignee}
                onChange={(e) => {
                  setAssignee(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Anyone</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABEL[u.role]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <QueryState query={list} isEmpty={rows.length === 0} empty={{ title: "No tasks here", text: emptyText }} rows={5}>
            <TaskTable tasks={rows} activeId={taskId} onOpen={openTask} />
          </QueryState>
          {meta ? (
            <Pager
              page={meta.page - 1}
              pageCount={meta.totalPages}
              total={meta.total}
              pageSize={PAGE_SIZE}
              noun="tasks"
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : null}
        </section>
      ) : (
        <MonthCalendar
          month={buildCalendar(month, calendarItems)}
          onPrev={() => setMonth((m) => m - 1)}
          onNext={() => setMonth((m) => m + 1)}
          onToday={() => setMonth(0)}
          emptyTitle="Nothing due this month"
          legend={
            <div className="flex flex-wrap gap-3 text-xs text-neutral">
              {LEGEND.map(([tone, label]) => (
                <span key={tone} className="inline-flex items-center gap-1.5">
                  <i className={`size-2 rounded-full ${CALENDAR_DOT[tone]}`} />
                  {label}
                </span>
              ))}
            </div>
          }
        />
      )}
      {taskId ? <TaskDrawer taskId={taskId} onClose={() => nav.setParams({ task: undefined })} onOpenCase={(id) => openCase(id, "tasks")} /> : null}
      {creating ? <NewTaskDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
