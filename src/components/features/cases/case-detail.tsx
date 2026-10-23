"use client";

import { useState, type ReactNode } from "react";

import { ErrorState, Skeleton } from "@/components/common/query-state";
import { ReassignDialog } from "@/components/features/people/person-dialogs";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader, Tabs, type SegmentOption } from "@/components/ui/primitives";
import { CASE_TONE, PRIORITY_TONE, STAGES } from "@/constants/vocab";
import { useMe } from "@/hooks/useStore";
import { fmtDay, relDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useCaseQuery } from "@/store/api/cases";
import { useClientQuery } from "@/store/api/people";
import type { Project, User } from "@/types/domain";
import { caseViewFor, isDone } from "./case-data";
import { ActivityTab, OverviewTab, TimelineTab } from "./case-info-tabs";
import { CaseStagePanel } from "./case-stage-panel";
import { DocumentsTab, FilingsTab, MessagesTab } from "./case-record-tabs";
import { EditCaseDialog } from "./edit-case-dialog";
import { NotesTab, TasksTab } from "./case-work-tabs";

type TabId = "overview" | "timeline" | "tasks" | "documents" | "filings" | "messages" | "notes" | "activity";

function tabsFor(canFilings: boolean, canActivity: boolean): Array<SegmentOption<TabId>> {
  const tabs: Array<SegmentOption<TabId>> = [
    { value: "overview", label: "Overview" },
    { value: "timeline", label: "Timeline" },
    { value: "tasks", label: "Tasks" },
    { value: "documents", label: "Documents" },
    { value: "messages", label: "Messages" },
    { value: "notes", label: "Internal notes" },
  ];
  if (canActivity) tabs.push({ value: "activity", label: "Activity" });
  if (canFilings) tabs.splice(4, 0, { value: "filings", label: "Filings" });
  return tabs;
}

const todayUtc = (): string => new Date().toISOString().slice(0, 10);

/**
 * One case, shared by Admin, Manager, Compliance and the client's CSR. `projectId` is the case's API id (the address is
 * /cases/<id> or /clients/<id>); the PRJ number people read comes from the record. A case outside the caller's scope is a 404.
 */
export function CaseDetail({ nav, projectId }: ViewProps & { projectId: string }) {
  const me = useMe();
  const result = useCaseQuery(projectId);
  const project = result.data;
  const clientResult = useClientQuery(project?.client ?? "", { skip: !project });
  const client = clientResult.data;
  const backLabel = me.role === "ADMIN" || me.role === "MANAGER" ? "All cases" : "Clients";
  const back = (
    <div>
      <Button variant="ghost" size="sm" className="pl-0.5" onClick={() => nav.go(caseViewFor(me.role))}>
        <Icon name="chevL" small />
        {backLabel}
      </Button>
    </div>
  );

  if (result.isLoading || (project && clientResult.isLoading)) {
    return (
      <div className="stack-16">
        {back}
        <Skeleton rows={6} />
      </div>
    );
  }
  if (result.isError) {
    const notFound = (result.error as { status?: number } | undefined)?.status === 404;
    return (
      <div className="stack-16">
        {back}
        {notFound ? (
          <EmptyState title="Case not available" text="This case doesn't exist, or it isn't in your scope." />
        ) : (
          <ErrorState error={result.error} onRetry={() => void result.refetch()} title="We couldn't load this case" />
        )}
      </div>
    );
  }
  if (!project) return null;
  if (!client) {
    return (
      <div className="stack-16">
        {back}
        <ErrorState error={clientResult.error} onRetry={() => void clientResult.refetch()} title="We couldn't load the client" />
      </div>
    );
  }
  return <CaseDetailBody nav={nav} project={project} client={client} back={back} />;
}

function CaseDetailBody({ nav, project, client, back }: ViewProps & { project: Project; client: User; back: ReactNode }) {
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [reassign, setReassign] = useState<User | null>(null);

  const tabs = tabsFor(me.role === "COMPLIANCE" || me.role === "ADMIN" || me.role === "MANAGER", can(me, "auditLog"));
  const requested = nav.param("tab");
  const tab = tabs.find((t) => t.value === requested)?.value ?? "overview";
  const overdue = Boolean(project.deadline) && project.deadline < todayUtc() && !isDone(project);

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
            {can(me, "conversation", { id: client.id, csr: client.csr }) ? (
              <Button onClick={() => nav.go("messages", { query: { c: client.id } })}>
                <Icon name="msg" small />
                Message client
              </Button>
            ) : null}
            {client.csr && can(me, "reassignClient", client) ? <Button onClick={() => setReassign(client)}>Reassign CSR</Button> : null}
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
      {editing ? <EditCaseDialog project={project} onClose={() => setEditing(false)} /> : null}
      <ReassignDialog user={reassign} onClose={() => setReassign(null)} />
    </div>
  );
}
