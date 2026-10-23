"use client";

import { useState } from "react";

import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Callout, Card, EmptyState } from "@/components/ui/primitives";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { fmtAt, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useAddCaseNoteMutation, useCompleteTaskMutation, useCreateTaskMutation, useReopenTaskMutation, useTasksQuery } from "@/store/api/cases";
import type { NoteVisibility, Project, TaskType, User, Visibility } from "@/types/domain";

interface TabProps {
  project: Project;
  client: User;
}

const todayUtc = (): string => new Date().toISOString().slice(0, 10);

export function TasksTab({ project, client, nav }: TabProps & { nav: WorkspaceNav }) {
  const me = useMe();
  const run = useAction();
  const result = useTasksQuery({ caseId: project.apiId, limit: 100, sort: "due", order: "asc" });
  const [complete] = useCompleteTaskMutation();
  const [reopen] = useReopenTaskMutation();
  const [create, { isLoading }] = useCreateTaskMutation();
  const [title, setTitle] = useState("");
  const [vis, setVis] = useState<Visibility>("internal");
  const [error, setError] = useState("");

  const today = todayUtc();
  const tasks = result.data?.items ?? [];
  const staffManager = me.role === "ADMIN" || me.role === "MANAGER";
  const canTask = me.role === "CSR" ? can(me, "followUpTask", { csr: client.csr }) : can(me, "complianceTask", client) || can(me, "manageProjects");
  const taskType: TaskType = me.role === "CSR" ? "CSR follow-up" : me.role === "COMPLIANCE" ? "Compliance" : "Operations";

  const add = async () => {
    setError("");
    const outcome = await run(create({ caseId: project.apiId, title: title.trim(), visibility: vis === "client" ? "CLIENT" : "INTERNAL", ...(staffManager ? { due: tomorrow() } : {}) }), {
      success: "Task added",
      quiet: true,
    });
    if (outcome.ok) setTitle("");
    else if (outcome.error.errorCode !== "PERMISSION_DENIED") setError(outcome.error.fieldErrors[0]?.message ?? outcome.error.message);
  };

  return (
    <Card>
      <QueryState query={result} isEmpty={tasks.length === 0} empty={{ title: "No tasks on this case" }} rows={3}>
        {tasks.map((t) => {
          const overdue = !t.done && Boolean(t.due) && t.due < today;
          return (
            <div key={t.id} className="row first:border-t-0">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => void run(t.done ? reopen(t.id) : complete(t.id))}
                aria-label={`Mark ${t.title} ${t.done ? "open again" : "done"}`}
                className="size-[18px] accent-primary"
              />
              <div className="min-w-0 flex-[1_1_220px]">
                <div className={`font-medium ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</div>
                <div className="help">
                  {t.assigneeName} · <span className={overdue ? "font-semibold text-danger-hover" : ""}>Due {t.due ? fmtDay(t.due) : "No due date"}</span>
                </div>
              </div>
              <Badge tone="q">{t.type}</Badge>
              <Badge tone={t.vis === "client" ? "brand" : "q"}>{t.vis === "client" ? "Visible to client" : "Internal"}</Badge>
              {staffManager ? (
                <Button size="sm" onClick={() => nav.go("tasks", { query: { task: t.id } })}>
                  Details
                </Button>
              ) : null}
            </div>
          );
        })}
      </QueryState>
      {canTask ? (
        <>
          <form
            className="row bg-surface-muted"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Input
              aria-label="New task"
              placeholder={`New ${taskType} task`}
              className="flex-[1_1_200px]"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
            />
            <Select aria-label="Visibility" className="w-auto" value={vis} onChange={(e) => setVis(e.target.value as Visibility)}>
              <option value="internal">Internal only</option>
              <option value="client">Visible to client</option>
            </Select>
            <Button type="submit" size="sm" variant="primary" disabled={!title.trim() || isLoading}>
              {isLoading ? "Adding…" : "Add task"}
            </Button>
          </form>
          {error ? (
            <div className="px-3.5 pb-2">
              <Callout tone="warn" icon="alert" role="alert">
                {error}
              </Callout>
            </div>
          ) : null}
          <p className="help px-3.5 pb-3">Tasks that only repeat an open document request are blocked; follow up on the request instead.</p>
        </>
      ) : null}
    </Card>
  );
}

/** Admin and Manager must choose a due date; a day from now is the quick default for a task typed here. */
function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

export function NotesTab({ project, client }: TabProps) {
  const me = useMe();
  const run = useAction();
  const [addNote, { isLoading }] = useAddCaseNoteMutation();
  const [draft, setDraft] = useState("");
  const [vis, setVis] = useState<NoteVisibility>("staff");
  const [error, setError] = useState("");

  const canCompliance = can(me, "caseNotesCompliance");
  // The server only sends the notes this role may read.
  const notes = project.notes.slice().reverse();

  const add = async () => {
    setError("");
    const outcome = await run(addNote({ id: project.apiId, text: draft.trim(), visibility: canCompliance && vis === "compliance" ? "COMPLIANCE" : "STAFF" }), {
      success: "Note added",
      quiet: true,
    });
    if (outcome.ok) setDraft("");
    else if (outcome.error.errorCode !== "PERMISSION_DENIED") setError(outcome.error.fieldErrors[0]?.message ?? outcome.error.message);
  };

  return (
    <Card>
      <div className="px-3.5 pt-3">
        <Callout tone="lock" icon="lock">
          Internal notes are never shown to the client.
        </Callout>
      </div>
      {notes.map((n) => (
        <div key={n.id} className="row items-start">
          <div className="min-w-0 flex-1">
            <div className="whitespace-pre-wrap text-sm">{n.text}</div>
            <div className="help">
              {n.byName} · {fmtAt(n.at)}
            </div>
          </div>
          <Badge tone={n.vis === "compliance" ? "violet" : "q"}>{n.vis === "compliance" ? "Compliance & management" : "All staff on the case"}</Badge>
        </div>
      ))}
      {notes.length === 0 ? <EmptyState title="No notes yet" /> : null}
      {can(me, "caseNotes", { csr: client.csr }) ? (
        <form
          className="card-b border-t border-muted"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Field label="New internal note" error={error}>
            {(id, describedBy) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError("");
                }}
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            {canCompliance ? (
              <Select aria-label="Note visibility" className="w-auto" value={vis} onChange={(e) => setVis(e.target.value as NoteVisibility)}>
                <option value="staff">All staff on the case</option>
                <option value="compliance">Compliance &amp; management only</option>
              </Select>
            ) : null}
            <span className="flex-1" />
            <Button type="submit" size="sm" variant="primary" disabled={!draft.trim() || isLoading}>
              {isLoading ? "Adding…" : "Add note"}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
