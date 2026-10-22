"use client";

import { useState, type ReactNode } from "react";

import { ReassignDialog } from "@/components/features/people/person-dialogs";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader, Tabs, type SegmentOption } from "@/components/ui/primitives";
import { CASE_TONE, PRIORITY_TONE, STAGES } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { dISO, fmtDay, relDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { openConversation } from "@/store/actions/comms";
import { requestReassign } from "@/store/actions/people";
import { projectById, userById } from "@/store/selectors";
import type { Project, User } from "@/types/domain";
import { caseViewFor, isDone } from "./case-data";
import { ActivityTab, OverviewTab, TimelineTab } from "./case-info-tabs";
import { CaseStagePanel } from "./case-stage-panel";
import { DocumentsTab, FilingsTab, MessagesTab } from "./case-record-tabs";
import { EditCaseDialog } from "./edit-case-dialog";
import { NotesTab, TasksTab } from "./case-work-tabs";

type TabId = "overview" | "timeline" | "tasks" | "documents" | "filings" | "messages" | "notes" | "activity";

function tabsFor(canFilings: boolean): Array<SegmentOption<TabId>> {
  const tabs: Array<SegmentOption<TabId>> = [
    { value: "overview", label: "Overview" },
    { value: "timeline", label: "Timeline" },
    { value: "tasks", label: "Tasks" },
    { value: "documents", label: "Documents" },
    { value: "messages", label: "Messages" },
    { value: "notes", label: "Internal notes" },
    { value: "activity", label: "Activity" },
  ];
  if (canFilings) tabs.splice(4, 0, { value: "filings", label: "Filings" });
  return tabs;
}

/** One case, shared by Admin, Manager, Compliance and the client's CSR. */
export function CaseDetail({ nav, projectId }: ViewProps & { projectId: string }) {
  const data = useData();
  const me = useMe();
  const project = projectById(data, projectId);
  const client = userById(data, project?.client);
  const backLabel = me.role === "ADMIN" || me.role === "MANAGER" ? "All cases" : "Clients";
  const back = (
    <div>
      <Button variant="ghost" size="sm" className="pl-0.5" onClick={() => nav.go(caseViewFor(me.role))}>
        <Icon name="chevL" small />
        {backLabel}
      </Button>
    </div>
  );

  if (!project || !client || !can(me, "viewClient", client)) {
    return (
      <div className="stack-16">
        {back}
        <EmptyState title="Case not available" text="This case doesn't exist, or it isn't in your scope." />
      </div>
    );
  }
  return <CaseDetailBody nav={nav} project={project} client={client} back={back} />;
}

function CaseDetailBody({ nav, project, client, back }: ViewProps & { project: Project; client: User; back: ReactNode }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [reassignId, setReassignId] = useState<string | null>(null);

  const tabs = tabsFor(me.role === "COMPLIANCE" || me.role === "ADMIN" || me.role === "MANAGER");
  const requested = nav.param("tab");
  const tab = tabs.find((t) => t.value === requested)?.value ?? "overview";
  const overdue = Boolean(project.deadline) && project.deadline < dISO(0) && !isDone(project);
  const csr = userById(data, client.csr);

  const openConv = () => {
    if (dispatch(openConversation(client.id))) nav.go("messages", { query: { c: client.id } });
  };
  const reassign = () => {
    if (dispatch(requestReassign(client.id))) setReassignId(client.id);
  };

  return (
    <div className="stack-16">
      {back}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {client.name}
            <span className="mono help font-normal">
              {client.caseId} · {project.id}
            </span>
          </span>
        }
        description={
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{STAGES[project.stageIdx]}</Badge>
            <Badge tone={CASE_TONE[project.status] ?? "q"}>{project.status}</Badge>
            <Badge tone={PRIORITY_TONE[project.priority] ?? "q"}>{project.priority || "Normal"} priority</Badge>
            <span className={`help ${overdue ? "font-semibold text-danger-hover" : ""}`}>
              Target {project.deadline ? `${fmtDay(project.deadline)} · ${relDay(project.deadline)}` : "Not set"}
            </span>
          </span>
        }
        actions={
          <>
            {can(me, "conversation", client) ? (
              <Button onClick={openConv}>
                <Icon name="msg" small />
                Message client
              </Button>
            ) : null}
            {csr && can(me, "reassignClient", client) ? <Button onClick={reassign}>Reassign CSR</Button> : null}
            {can(me, "editCase") ? (
              <Button variant="primary" onClick={() => setEditing(true)}>
                <Icon name="edit" small />
                Edit details
              </Button>
            ) : null}
          </>
        }
      />
      <CaseStagePanel key={project.stageIdx} project={project} />
      <Tabs label="Case sections" options={tabs} value={tab} onChange={(t) => nav.setParams({ tab: t === "overview" ? undefined : t })} />
      {tab === "overview" ? <OverviewTab project={project} client={client} /> : null}
      {tab === "timeline" ? <TimelineTab project={project} client={client} /> : null}
      {tab === "tasks" ? <TasksTab project={project} client={client} nav={nav} /> : null}
      {tab === "documents" ? <DocumentsTab project={project} client={client} nav={nav} /> : null}
      {tab === "filings" ? <FilingsTab project={project} client={client} nav={nav} /> : null}
      {tab === "messages" ? <MessagesTab project={project} client={client} nav={nav} /> : null}
      {tab === "notes" ? <NotesTab project={project} client={client} /> : null}
      {tab === "activity" ? <ActivityTab project={project} client={client} /> : null}
      {editing ? <EditCaseDialog projectId={project.id} onClose={() => setEditing(false)} /> : null}
      <ReassignDialog userId={reassignId} onClose={() => setReassignId(null)} />
    </div>
  );
}
