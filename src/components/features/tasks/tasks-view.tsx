"use client";

import { useState } from "react";

import { useOpenCase } from "@/components/features/projects/use-open-case";
import { NewTaskDialog } from "@/components/features/tasks/new-task-dialog";
import { TaskDrawer } from "@/components/features/tasks/task-drawer";
import { activeStaff, isOverdue, requestNewTask, visibleWork } from "@/components/features/tasks/task-helpers";
import { TaskTable } from "@/components/features/tasks/task-table";
import type { ViewProps } from "@/components/features/workspace/types";
import { MonthCalendar, CALENDAR_DOT } from "@/components/common/month-calendar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Chip, Count, EmptyState, Segmented } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { buildCalendar, type CalendarItem } from "@/lib/calendar";
import { dISO } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { userName } from "@/store/selectors";
import type { Task } from "@/types/domain";

type Mode = "list" | "calendar";
type Whose = "mine" | "team";
type DueFilter = "open" | "overdue" | "today" | "upcoming" | "done";

const MODES = [
  { value: "list", label: "List" },
  { value: "calendar", label: "Calendar" },
] as const;

const FILTERS: ReadonlyArray<{ id: DueFilter; label: string; test: (t: Task, today: string) => boolean }> = [
  { id: "open", label: "All open", test: (t) => !t.done },
  { id: "overdue", label: "Overdue", test: (t) => isOverdue(t) },
  { id: "today", label: "Due today", test: (t, today) => !t.done && t.due === today },
  { id: "upcoming", label: "Upcoming", test: (t, today) => !t.done && t.due > today },
  { id: "done", label: "Completed", test: (t) => t.done },
];

const LEGEND = [
  ["info", "Task"],
  ["bad", "Overdue"],
  ["ok", "Done"],
  ["case", "Case target"],
] as const;

export function TasksView({ nav }: ViewProps) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const openCase = useOpenCase(nav);
  const [mode, setMode] = useState<Mode>("list");
  const [whose, setWhose] = useState<Whose>("team");
  const [filter, setFilter] = useState<DueFilter>(FILTERS.find((f) => f.id === nav.param("filter"))?.id ?? "open");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [month, setMonth] = useState(0);
  const [creating, setCreating] = useState(nav.param("new") === "1");

  const today = dISO(0);
  const { projects, tasks: base } = visibleWork(data, me);
  const scope = whose === "mine" ? base.filter((t) => t.assignee === me.id) : base;
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const taskId = Number(nav.param("task")) || null;

  const q = query.trim().toLowerCase();
  const rows = scope
    .filter((t) => active.test(t, today))
    .filter((t) => {
      const project = projects.find((p) => p.id === t.project);
      const text = `${t.title} ${t.project} ${userName(data, project?.client)}`.toLowerCase();
      return (!q || text.includes(q)) && (!assignee || t.assignee === assignee);
    })
    .sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : (a.due || "9999") < (b.due || "9999") ? -1 : 1));

  const openTask = (id: number) => nav.setParams({ task: String(id) });
  const calendarItems: CalendarItem[] = [
    ...scope
      .filter((t) => t.due)
      .map((t): CalendarItem => {
        const late = isOverdue(t);
        return {
          id: `task-${t.id}`,
          date: t.due,
          title: t.title,
          kind: t.done ? "Done" : late ? "Overdue" : "Task",
          tone: t.done ? "ok" : late ? "bad" : "info",
          onSelect: () => openTask(t.id),
        };
      }),
    ...projects
      .filter((p) => p.deadline && p.stageIdx < 10 && p.status !== "Completed")
      .map(
        (p): CalendarItem => ({
          id: `case-${p.id}`,
          date: p.deadline,
          title: `${p.id} target · ${userName(data, p.client)}`,
          kind: "Case target",
          tone: "case",
          onSelect: () => openCase(p.id),
        }),
      ),
  ];

  const emptyText =
    scope.length === 0
      ? whose === "mine"
        ? "No tasks are assigned to you. Switch to Team tasks to see everyone's work."
        : "No tasks yet. Create one and link it to a case."
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
            <Button
              variant="primary"
              onClick={() => {
                if (dispatch(requestNewTask())) setCreating(true);
              }}
            >
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
          onChange={setWhose}
          options={[
            { value: "mine", label: `My tasks ${base.filter((t) => t.assignee === me.id && !t.done).length}` },
            { value: "team", label: `Team tasks ${base.filter((t) => !t.done).length}` },
          ]}
        />
        <div role="group" aria-label="Due filter" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <Count>{scope.filter((t) => f.test(t, today)).length}</Count>
            </Chip>
          ))}
        </div>
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
                onChange={(e) => setQuery(e.target.value)}
              />
              <Select aria-label="Filter by assignee" className="w-auto" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Anyone</option>
                {activeStaff(data).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABEL[u.role]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <TaskTable tasks={rows} activeId={taskId} onOpen={openTask} />
          {rows.length === 0 ? <EmptyState title="No tasks here" text={emptyText} /> : null}
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
      {taskId ? (
        <TaskDrawer taskId={taskId} onClose={() => nav.setParams({ task: undefined })} onOpenCase={(id) => openCase(id, "tasks")} />
      ) : null}
      {creating ? <NewTaskDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
