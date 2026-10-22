import { COMP_STAGES, STAGES } from "@/constants/vocab";
import { dISO, fmtDay } from "@/lib/dates";
import { REASON, type Permission } from "@/lib/permissions";
import type { AppThunk } from "@/store";
import { check, fail, flash, guard, notify, OK, showDenied, type ActionResult } from "@/store/actions/core";
import { projectById, projectOfClient, selectMe, userById } from "@/store/selectors";
import { workspaceActions } from "@/store/workspaceSlice";
import type {
  CaseStatus,
  DemoData,
  FilingStatus,
  FollowUpType,
  NoteVisibility,
  Priority,
  Project,
  Task,
  TaskType,
  Visibility,
} from "@/types/domain";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Status a case takes after moving to a stage, unless it is on hold or blocked. */
export function statusAfterMove(prev: CaseStatus, idx: number): CaseStatus {
  if (idx >= 10) return "Completed";
  if (prev === "On Hold" || prev === "Blocked") return prev;
  return idx <= 3 ? "Awaiting Client" : "Active";
}

/** Moving past state approval needs the state's own confirmation number, unless one is already recorded. */
export function needsFilingNumber(project: Project, target: string): boolean {
  const idx = STAGES.indexOf(target as (typeof STAGES)[number]);
  return idx > 7 && project.stageIdx <= 7 && !project.filing;
}

/** A task that only repeats an open document request is blocked; the request is the thing to follow up on. */
export function findDuplicateDocument(data: DemoData, clientId: string, title: string) {
  const norm = (x: string): string =>
    x
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\b(upload|send|provide|submit|get|collect|request|the|a|an|new|updated|copy|of)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const t = norm(title);
  if (t.length < 4) return null;
  return (
    data.docs.find((d) => {
      if (d.client !== clientId || !["requested", "rejected", "info"].includes(d.status)) return false;
      const k = norm(d.name);
      return k.length >= 4 && (t.includes(k) || k.includes(t));
    }) ?? null
  );
}

function taskPermission(role: string): Permission {
  if (role === "CSR") return "followUpTask";
  if (role === "COMPLIANCE") return "complianceTask";
  return "manageProjects";
}

export interface NewCaseInput {
  client: string;
  service: string;
  state: string;
  priority: Priority;
  deadline: string;
  biz: string;
}

export function createCase(input: NewCaseInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const client = userById(data, input.client);
    if (!client) return fail("Choose a client.");
    if (projectOfClient(data, client.id)) return fail(`${client.caseId} already has a case.`);
    if (!DATE_PATTERN.test(input.deadline)) return fail("Choose a target date.");
    if (!dispatch(guard("editCase", undefined, `Created case for ${client.name}`, client.caseId ?? ""))) return fail("Not allowed.");
    const service = data.services.find((s) => s.id === input.service);
    const id = `PRJ-${data.counters.nextPrj}`;
    const active = client.status === "Active";
    const now = Date.now();
    const project: Project = {
      id,
      client: client.id,
      stageIdx: active ? 1 : 0,
      status: "Awaiting Client",
      filing: "",
      service: input.service,
      priority: input.priority,
      deadline: input.deadline,
      createdAt: now,
      last: now,
      owner: "",
      notes: [],
      events: [{ to: active ? "Client Onboarding" : "Invitation Sent", by: me.id, at: now, note: "Case created" }],
    };
    dispatch(workspaceActions.added({ key: "projects", item: project }));
    dispatch(workspaceActions.counterBumped("nextPrj"));
    dispatch(
      workspaceActions.patched({
        key: "users",
        id: client.id,
        patch: { biz: input.biz.trim() || client.biz || "Business name to be confirmed", state: input.state },
      }),
    );
    dispatch(notify([client.id], `Your ${service?.name ?? "case"} was opened`, "home"));
    if (client.csr) dispatch(notify([client.csr], `New case ${id} for ${client.name}`, "projects"));
    flash(`Case ${id} created for ${client.name}`);
    return { ok: true, id };
  };
}

/** The projects screen creates a case with defaults; it shares the same rules as createCase. */
export function createFormationProject(input: { client: string; state: string; biz: string }): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const client = userById(data, input.client);
    if (!client) return fail("Choose a client.");
    if (!dispatch(guard("manageProjects", undefined, "Created formation project", client.caseId ?? ""))) return fail("Not allowed.");
    if (projectOfClient(data, client.id)) return fail(`${client.caseId} already has a formation project`);
    const me = selectMe(getState());
    const active = client.status === "Active";
    const now = Date.now();
    const id = `PRJ-${data.counters.nextPrj}`;
    dispatch(
      workspaceActions.added({
        key: "projects",
        item: {
          id,
          client: client.id,
          stageIdx: active ? 1 : 0,
          status: "Awaiting Client",
          filing: "",
          service: "llc",
          priority: "Normal",
          deadline: "",
          createdAt: now,
          last: now,
          owner: "",
          notes: [],
          events: [{ to: active ? "Client Onboarding" : "Invitation Sent", by: me.id, at: now, note: "Case created" }],
        },
      }),
    );
    dispatch(workspaceActions.counterBumped("nextPrj"));
    dispatch(
      workspaceActions.patched({
        key: "users",
        id: client.id,
        patch: { biz: input.biz.trim() || "Business name to be confirmed", state: input.state },
      }),
    );
    dispatch(notify([client.id], `Your ${input.state} LLC formation project was created`));
    flash(`Project created for ${client.name}`);
    return { ok: true, id };
  };
}

export interface CaseEditInput {
  status: CaseStatus;
  priority: Priority;
  deadline: string;
  service: string;
  owner: string;
}

export function saveCaseEdit(projectId: string, input: CaseEditInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const project = projectById(data, projectId);
    if (!project) return fail("That case no longer exists.");
    if (input.deadline && !DATE_PATTERN.test(input.deadline)) return fail("Enter a valid date.");
    const client = userById(data, project.client);
    if (!dispatch(guard("editCase", undefined, `Updated case details ${project.id} (status ${input.status}, priority ${input.priority})`, client?.caseId ?? ""))) {
      return fail("Not allowed.");
    }
    const changes: string[] = [];
    if (input.status !== project.status) changes.push(`status ${project.status} → ${input.status}`);
    if (input.priority !== project.priority) changes.push(`priority → ${input.priority}`);
    if (input.deadline !== project.deadline) changes.push(`target date → ${fmtDay(input.deadline)}`);
    if (input.owner !== (project.owner ?? "")) changes.push(`compliance owner → ${userById(data, input.owner)?.name ?? "none"}`);
    const now = Date.now();
    dispatch(
      workspaceActions.patched({
        key: "projects",
        id: project.id,
        patch: {
          status: input.status,
          priority: input.priority,
          deadline: input.deadline,
          service: input.service,
          owner: input.owner,
          last: now,
          completedAt: input.status === "Completed" && !project.completedAt ? now : project.completedAt,
          events: changes.length
            ? [...project.events, { to: "", by: me.id, at: now, note: `Updated ${changes.join(", ")}` }]
            : project.events,
        },
      }),
    );
    if (input.owner && input.owner !== project.owner) {
      dispatch(notify([input.owner], `You now own compliance for ${project.id}`, "clients"));
    }
    flash(changes.length ? "Case updated" : "No changes to save");
    return OK;
  };
}

export function moveStage(projectId: string, target: string, filingNo: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const project = projectById(data, projectId);
    if (!project) return fail("That case no longer exists.");
    const client = userById(data, project.client);
    const idx = STAGES.indexOf(target as (typeof STAGES)[number]);
    if (idx < 0) return fail("Choose a stage.");
    if (!dispatch(guard("complianceMilestones", { target }, `Moved ${project.id} to ${target}`, client?.caseId ?? ""))) {
      return fail("Not allowed.");
    }
    if (me.role === "COMPLIANCE" && !COMP_STAGES.includes(STAGES[project.stageIdx])) {
      dispatch(showDenied("Not available to Compliance", REASON.complianceMilestones));
      return fail("Not allowed.");
    }
    const needFiling = needsFilingNumber(project, target);
    const filing = filingNo.trim();
    if (needFiling && !filing) return fail("Enter the state's confirmation number.");
    const now = Date.now();
    dispatch(
      workspaceActions.patched({
        key: "projects",
        id: project.id,
        patch: {
          stageIdx: idx,
          status: statusAfterMove(project.status, idx),
          filing: needFiling ? filing : project.filing,
          last: now,
          completedAt: idx >= 10 ? now : project.completedAt,
          events: [
            ...project.events,
            { to: target, by: me.id, at: now, note: needFiling ? `State confirmation ${filing}` : "" },
          ],
        },
      }),
    );
    dispatch(notify([project.client], `Your formation moved to “${target}”`, "home"));
    flash(`${project.id} moved to ${target} · client notified`);
    return OK;
  };
}

export function addCaseNote(projectId: string, text: string, vis: NoteVisibility): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const project = projectById(data, projectId);
    const body = text.trim();
    if (!project || !body) return fail("Write a note first.");
    const client = userById(data, project.client);
    if (!dispatch(guard("caseNotes", client, `Added internal note on ${projectId}`, client?.caseId ?? ""))) return fail("Not allowed.");
    if (vis === "compliance" && !dispatch(guard("caseNotesCompliance", undefined, `Added Compliance-only note on ${projectId}`, client?.caseId ?? ""))) {
      return fail("Not allowed.");
    }
    const now = Date.now();
    dispatch(
      workspaceActions.patched({
        key: "projects",
        id: projectId,
        patch: { notes: [...project.notes, { id: now, by: me.id, vis, text: body, at: now }], last: now },
      }),
    );
    flash("Internal note added · never shown to the client");
    return OK;
  };
}

export function addProjectTask(projectId: string, title: string, type: TaskType, vis: Visibility): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const project = projectById(data, projectId);
    const trimmed = title.trim();
    if (!project || !trimmed) return fail("Enter a task title.");
    const client = userById(data, project.client);
    if (!dispatch(guard(taskPermission(me.role), client, `Added task “${trimmed}”`, client?.caseId ?? ""))) return fail("Not allowed.");
    const dup = findDuplicateDocument(data, project.client, trimmed);
    if (dup) {
      dispatch(
        showDenied(
          "This task repeats a document request",
          `“${dup.name}” is already requested from the client and tracked in Documents. Follow up on the request instead of adding a duplicate task.`,
        ),
      );
      return fail("Duplicate of an open document request.");
    }
    const task: Task = {
      id: data.counters.nextId,
      project: projectId,
      title: trimmed,
      type,
      vis,
      done: false,
      by: me.id,
      assignee: me.id,
      due: dISO(3),
      priority: "Normal",
      createdAt: Date.now(),
    };
    dispatch(workspaceActions.added({ key: "tasks", item: task }));
    dispatch(workspaceActions.counterBumped("nextId"));
    if (vis === "client") dispatch(notify([client?.id], `New task: ${trimmed}`));
    flash(vis === "client" ? "Task added and visible to the client" : "Internal task added");
    return OK;
  };
}

export function toggleTask(taskId: number): AppThunk {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const task = data.tasks.find((t) => t.id === taskId);
    const project = projectById(data, task?.project);
    if (!task || !project) return;
    const client = userById(data, project.client);
    const verb = task.done ? "Reopened task " : "Completed task ";
    if (!dispatch(guard(taskPermission(me.role), client, `${verb}${task.title}`, client?.caseId ?? ""))) return;
    dispatch(
      workspaceActions.patched({
        key: "tasks",
        id: taskId,
        patch: { done: !task.done, completedAt: !task.done ? Date.now() : undefined },
      }),
    );
    flash(task.done ? "Task reopened" : "Task completed");
  };
}

export interface TaskInput {
  title: string;
  project: string;
  assignee: string;
  priority: Priority;
  due: string;
  vis: Visibility;
}

export function createTask(input: TaskInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const title = input.title.trim();
    if (!title) return fail("Enter a task title.");
    const project = projectById(data, input.project);
    if (!project) return fail("Link the task to a case.");
    if (!input.due) return fail("Choose a due date.");
    const client = userById(data, project.client);
    const dup = findDuplicateDocument(data, project.client, title);
    if (dup) {
      return fail(`“${dup.name}” is already requested from this client in Documents. Follow up on that request instead of adding a duplicate task.`);
    }
    const assignee = userById(data, input.assignee);
    if (!assignee || assignee.role === "CLIENT" || assignee.status !== "Active") {
      return fail("Assign the task to an active staff member.");
    }
    if (!dispatch(guard("manageTasks", undefined, `Created task “${title}” for ${assignee.name}`, client?.caseId ?? ""))) {
      return fail("Not allowed.");
    }
    const type: TaskType = assignee.role === "COMPLIANCE" ? "Compliance" : assignee.role === "CSR" ? "CSR follow-up" : "Operations";
    dispatch(
      workspaceActions.added({
        key: "tasks",
        item: {
          id: data.counters.nextId,
          project: project.id,
          title,
          type,
          vis: input.vis,
          done: false,
          by: me.id,
          assignee: assignee.id,
          due: input.due,
          priority: input.priority,
          createdAt: Date.now(),
        },
      }),
    );
    dispatch(workspaceActions.counterBumped("nextId"));
    if (assignee.id !== me.id) {
      dispatch(notify([assignee.id], `Task assigned to you: ${title}`, assignee.role === "CSR" || assignee.role === "COMPLIANCE" ? "projects" : "tasks"));
    }
    if (input.vis === "client" && client) dispatch(notify([client.id], `New task: ${title}`, "home"));
    flash(`Task created and assigned to ${assignee.name}`);
    return OK;
  };
}

export function saveTask(taskId: number, input: Omit<TaskInput, "project">): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return fail("That task no longer exists.");
    if (!input.title.trim()) return fail("Enter a task title.");
    const client = userById(data, projectById(data, task.project)?.client);
    if (!dispatch(guard("manageTasks", undefined, `Edited task “${task.title}”`, client?.caseId ?? ""))) return fail("Not allowed.");
    dispatch(
      workspaceActions.patched({
        key: "tasks",
        id: taskId,
        patch: { title: input.title.trim(), assignee: input.assignee, priority: input.priority, due: input.due, vis: input.vis },
      }),
    );
    if (input.assignee !== task.assignee && input.assignee !== me.id) {
      dispatch(notify([input.assignee], `Task assigned to you: ${input.title.trim()}`, "tasks"));
    }
    flash("Task saved");
    return OK;
  };
}

export interface FollowUpInput {
  client: string;
  type: FollowUpType;
  due: string;
  note: string;
}

export function addFollowup(input: FollowUpInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const client = userById(data, input.client);
    if (!client) return fail("Choose a client.");
    if (!input.due) return fail("Choose a due date.");
    if (!input.note.trim()) return fail("Add what the follow-up is about.");
    if (!dispatch(guard("followups", client, `Added follow-up for ${client.name}`, client.caseId ?? "", { cat: "cases" }))) {
      return fail("Not allowed.");
    }
    dispatch(
      workspaceActions.added({
        key: "followups",
        item: {
          id: data.counters.nextFu,
          client: client.id,
          csr: client.csr ?? me.id,
          type: input.type,
          due: input.due,
          status: "Open",
          note: input.note.trim(),
          createdAt: Date.now(),
        },
      }),
    );
    dispatch(workspaceActions.counterBumped("nextFu"));
    flash(`Reminder added for ${fmtDay(input.due)}`);
    return OK;
  };
}

export function completeFollowup(id: number, outcome: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const followup = data.followups.find((f) => f.id === id);
    if (!followup) return fail("That follow-up no longer exists.");
    const client = userById(data, followup.client);
    const text = outcome.trim();
    if (!text) return fail("Record what happened.");
    if (!dispatch(guard("followups", client, `Completed follow-up with ${client?.name ?? ""}`, client?.caseId ?? "", { cat: "cases" }))) {
      return fail("Not allowed.");
    }
    dispatch(workspaceActions.patched({ key: "followups", id, patch: { status: "Done", outcome: text, doneAt: Date.now() } }));
    dispatch(
      workspaceActions.added({
        key: "interactions",
        item: { id: data.counters.nextInt, client: followup.client, by: me.id, kind: followup.type, text, at: Date.now() },
      }),
    );
    dispatch(workspaceActions.counterBumped("nextInt"));
    flash("Follow-up completed and added to the timeline");
    return OK;
  };
}

export function recordInteraction(input: { client: string; kind: FollowUpType; text: string }): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const client = userById(data, input.client);
    if (!client) return fail("Choose a client.");
    if (!input.text.trim()) return fail("Summarize the interaction.");
    if (!dispatch(guard("followups", client, `Recorded ${input.kind.toLowerCase()} with ${client.name}`, client.caseId ?? "", { cat: "cases" }))) {
      return fail("Not allowed.");
    }
    dispatch(
      workspaceActions.added({
        key: "interactions",
        item: { id: data.counters.nextInt, client: client.id, by: me.id, kind: input.kind, text: input.text.trim(), at: Date.now() },
      }),
    );
    dispatch(workspaceActions.counterBumped("nextInt"));
    flash("Interaction recorded");
    return OK;
  };
}

export interface FilingInput {
  project: string;
  type: string;
  submitted: string;
  status: FilingStatus;
  ref: string;
  next: string;
  nextDate: string;
}

export function openFilingEditor(): AppThunk<boolean> {
  return (dispatch) => dispatch(check("filingTracker", undefined, "Open filing editor", ""));
}

export function saveFiling(id: string, input: FilingInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const project = projectById(data, input.project);
    if (!project) return fail("Choose the case this filing belongs to.");
    const needsDate: FilingStatus[] = ["Submitted", "Pending state review", "Approved", "Rejected"];
    if (needsDate.includes(input.status) && !input.submitted) return fail("Enter the submission date.");
    if (input.status === "Approved" && !input.ref.trim()) {
      return fail("Approved filings need the reference number issued by the state.");
    }
    const client = userById(data, project.client);
    const label = `${id ? `Updated filing ${id}` : "Added filing"} · ${input.type} · ${input.status}`;
    if (!dispatch(guard("filingTracker", undefined, label, client?.caseId ?? "", { cat: "cases" }))) return fail("Not allowed.");
    const record = {
      project: input.project,
      type: input.type,
      submitted: input.submitted,
      status: input.status,
      ref: input.ref.trim(),
      next: input.next.trim(),
      nextDate: input.nextDate,
      outcome: input.status === "Approved" || input.status === "Rejected" ? input.status : "",
      updated: Date.now(),
    };
    if (id) {
      dispatch(workspaceActions.patched({ key: "filings", id, patch: record }));
    } else {
      dispatch(workspaceActions.added({ key: "filings", item: { id: `FIL-${data.counters.nextFiling}`, ...record } }));
      dispatch(workspaceActions.counterBumped("nextFiling"));
    }
    flash("Filing tracker updated (manual record, no state system contacted)");
    return OK;
  };
}

export function saveService(
  id: string,
  input: { desc: string; turnaround: string; fee: string; active: boolean },
): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const service = getState().workspace.data.services.find((s) => s.id === id);
    if (!service) return fail("That service no longer exists.");
    if (!input.desc.trim()) return fail("Add a short description.");
    if (!dispatch(guard("manageServices", undefined, `Updated service “${service.name}”`, "Service catalog"))) return fail("Not allowed.");
    dispatch(
      workspaceActions.patched({
        key: "services",
        id,
        patch: { desc: input.desc.trim(), turnaround: input.turnaround.trim(), fee: input.fee.trim(), active: input.active },
      }),
    );
    flash("Service saved in this demo session");
    return OK;
  };
}

/** Whether the signed-in user may open a case; refusals are logged and explained. */
export function openCaseCheck(projectId: string): AppThunk<boolean> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const project = projectById(data, projectId);
    if (!project) return false;
    const client = userById(data, project.client);
    return dispatch(check("viewClient", client, `Open case ${projectId}`, client?.caseId ?? ""));
  };
}
