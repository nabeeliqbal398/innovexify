"use client";

import { useState } from "react";

import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/form";
import { Callout, Card, EmptyState } from "@/components/ui/primitives";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { dISO, fmtAt, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { ROLE_LABEL } from "@/constants/vocab";
import { addCaseNote, addProjectTask, findDuplicateDocument, toggleTask } from "@/store/actions/cases";
import { userById, userName } from "@/store/selectors";
import type { NoteVisibility, Project, TaskType, User, Visibility } from "@/types/domain";

interface TabProps {
  project: Project;
  client: User;
}

export function TasksTab({ project, client, nav }: TabProps & { nav: WorkspaceNav }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState("");
  const [vis, setVis] = useState<Visibility>("internal");
  const [error, setError] = useState("");

  const today = dISO(0);
  const tasks = data.tasks.filter((t) => t.project === project.id);
  const staffManager = me.role === "ADMIN" || me.role === "MANAGER";
  const canTask = me.role === "CSR" ? can(me, "followUpTask", client) : can(me, "complianceTask", client) || can(me, "manageProjects");
  const taskType: TaskType = me.role === "CSR" ? "CSR follow-up" : me.role === "COMPLIANCE" ? "Compliance" : "Operations";
  const duplicate = title.trim() ? findDuplicateDocument(data, client.id, title) : null;

  const add = () => {
    const result = dispatch(addProjectTask(project.id, title, taskType, vis));
    if (result.ok) {
      setTitle("");
      setError("");
    } else setError(result.error ?? "Could not add the task.");
  };

  return (
    <Card>
      {tasks.map((t) => {
        const overdue = !t.done && Boolean(t.due) && t.due < today;
        return (
          <div key={t.id} className="row first:border-t-0">
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => dispatch(toggleTask(t.id))}
              aria-label={`Mark ${t.title} done`}
              className="size-[18px] accent-primary"
            />
            <div className="min-w-0 flex-[1_1_220px]">
              <div className={`font-medium ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</div>
              <div className="help">
                {t.assignee ? userName(data, t.assignee) : "Unassigned"} ·{" "}
                <span className={overdue ? "font-semibold text-danger-hover" : ""}>Due {t.due ? fmtDay(t.due) : "No due date"}</span>
              </div>
            </div>
            <Badge tone="q">{t.type}</Badge>
            <Badge tone={t.vis === "client" ? "brand" : "q"}>{t.vis === "client" ? "Visible to client" : "Internal"}</Badge>
            {staffManager ? (
              <Button size="sm" onClick={() => nav.go("tasks", { query: { task: String(t.id) } })}>
                Details
              </Button>
            ) : null}
          </div>
        );
      })}
      {tasks.length === 0 ? <EmptyState title="No tasks on this case" /> : null}
      {canTask ? (
        <>
          <form
            className="row bg-surface-muted"
            onSubmit={(e) => {
              e.preventDefault();
              add();
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
            <Button type="submit" size="sm" variant="primary" disabled={!title.trim()}>
              Add task
            </Button>
          </form>
          {duplicate ? (
            <div className="px-3.5 pb-2">
              <Callout tone="warn" icon="alert">
                “{duplicate.name}” is already an open document request for this client. Adding this task will be blocked.
              </Callout>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="errtxt px-3.5 pb-2">
              {error}
            </p>
          ) : null}
          <p className="help px-3.5 pb-3">Tasks that only repeat an open document request are blocked; follow up on the request instead.</p>
        </>
      ) : null}
    </Card>
  );
}

export function NotesTab({ project, client }: TabProps) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState("");
  const [vis, setVis] = useState<NoteVisibility>("staff");
  const [error, setError] = useState("");

  const canCompliance = can(me, "caseNotesCompliance");
  const notes = project.notes.filter((n) => n.vis === "staff" || canCompliance).slice().reverse();
  const hidden = project.notes.length - notes.length;

  const add = () => {
    const result = dispatch(addCaseNote(project.id, draft, canCompliance ? vis : "staff"));
    if (result.ok) {
      setDraft("");
      setError("");
    } else setError(result.error ?? "Could not add the note.");
  };

  return (
    <Card>
      <div className="px-3.5 pt-3">
        <Callout tone="lock" icon="lock">
          Internal notes are never shown to the client.
        </Callout>
      </div>
      {hidden > 0 ? <p className="help px-3.5 pt-2">{hidden} Compliance-only note(s) are hidden from your role.</p> : null}
      {notes.map((n) => (
        <div key={n.id} className="row items-start">
          <div className="min-w-0 flex-1">
            <div className="whitespace-pre-wrap text-sm">{n.text}</div>
            <div className="help">
              {userName(data, n.by)} · {userById(data, n.by) ? ROLE_LABEL[userById(data, n.by)?.role ?? "CSR"] : ""} · {fmtAt(n.at)}
            </div>
          </div>
          <Badge tone={n.vis === "compliance" ? "violet" : "q"}>{n.vis === "compliance" ? "Compliance & management" : "All staff on the case"}</Badge>
        </div>
      ))}
      {notes.length === 0 ? <EmptyState title="No notes yet" /> : null}
      {can(me, "caseNotes", client) ? (
        <form
          className="card-b border-t border-muted"
          onSubmit={(e) => {
            e.preventDefault();
            add();
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
            <Button type="submit" size="sm" variant="primary" disabled={!draft.trim()}>
              Add note
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
