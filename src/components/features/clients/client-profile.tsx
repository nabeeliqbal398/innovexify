"use client";

import { useState } from "react";

import { ActivityTimeline } from "@/components/features/cases/activity-timeline";
import { buildTimeline } from "@/components/features/cases/case-data";
import { DocumentPreviewDialog } from "@/components/features/cases/document-preview-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Callout, CardHeader, EmptyState, Facts, Progress, Tabs, type SegmentOption } from "@/components/ui/primitives";
import { DOC_STATUS, STAGES } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { dISO, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { check } from "@/store/actions/core";
import { openFile } from "@/store/actions/comms";
import { projectOfClient, userName } from "@/store/selectors";
import type { User } from "@/types/domain";
import { onboarding } from "./client-data";
import { CompleteFollowupDialog, InteractionDialog, ReminderDialog } from "./followup-dialogs";

type ClientTab = "overview" | "timeline" | "followups";
const TABS: Array<SegmentOption<ClientTab>> = [
  { value: "overview", label: "Overview" },
  { value: "timeline", label: "Relationship timeline" },
  { value: "followups", label: "Follow-ups" },
];

type Dialog = { kind: "reminder" } | { kind: "interaction" } | { kind: "complete"; id: number } | null;

/** Expanded profile for one client, opened with `?client=<id>`. */
export function ClientProfile({ client, onClose, onOpenCase }: { client: User; onClose: () => void; onOpenCase: (projectId: string) => void }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState<ClientTab>("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const project = projectOfClient(data, client.id);
  const ob = onboarding(data, client);
  const canFiles = can(me, "docsAccess", { client: client.id });
  const docs = data.docs.filter((d) => d.client === client.id);
  const timeline = project ? buildTimeline(data, project, me.role, true).slice(0, 30) : [];
  const today = dISO(0);
  const followups = data.followups.filter((f) => f.client === client.id).sort((a, b) => (a.due < b.due ? 1 : -1));
  const openTickets = data.tickets.filter((t) => t.client === client.id && t.status !== "Closed" && t.status !== "Resolved").length;
  const canFollowup = can(me, "followups", client);
  const csrName = client.csr ? userName(data, client.csr) : "Unassigned";

  const openDialog = (next: Dialog, label: string) => {
    if (dispatch(check("followups", client, label, client.caseId ?? ""))) setDialog(next);
  };

  return (
    <section className="card overflow-hidden" aria-label="Client profile">
      <CardHeader>
        <span className="h3">{client.name}</span>
        <span className="mono help">{client.caseId}</span>
        <Badge tone="q">CSR: {csrName}</Badge>
        <span className="flex-1" />
        {project ? (
          <Button size="sm" onClick={() => onOpenCase(project.id)}>
            Open case
          </Button>
        ) : null}
        <button
          type="button"
          aria-label="Close client profile"
          onClick={onClose}
          className="inline-flex size-8 flex-none items-center justify-center rounded-md text-neutral hover:bg-muted hover:text-foreground"
        >
          <Icon name="x" small />
        </button>
      </CardHeader>
      <div className="px-2">
        <Tabs label="Client profile sections" options={TABS} value={tab} onChange={setTab} />
      </div>
      <div className="card-b">
        {tab === "overview" ? (
          <>
            <Facts
              items={[
                { label: "Email", value: client.email },
                { label: "Phone", value: client.phone || "No phone on file" },
                { label: "Preferred contact", value: client.contactPref || "Portal message" },
                { label: "Formation", value: `${client.biz || "Business name to be confirmed"} · ${client.state || "State not chosen"}` },
                { label: "Current stage", value: `${project ? STAGES[project.stageIdx] : "No project"}${project ? ` · ${project.status}` : ""}` },
                {
                  label: "Next milestone",
                  value: project ? (project.stageIdx < 10 ? STAGES[project.stageIdx + 1] : "Formation complete") : "Case not opened yet",
                },
                { label: "Open tickets", value: openTickets },
                {
                  label: "Onboarding",
                  value: (
                    <span className="flex items-center gap-1.5">
                      <Progress value={ob.pct} label="Onboarding progress" className="max-w-[140px] flex-1" />
                      <span className="mono">{ob.label}</span>
                    </span>
                  ),
                },
              ]}
            />
            <div className="stack-8">
              <span className="flabel">Documents</span>
              {me.role === "CSR" ? (
                <Callout tone="lock" icon="lock">
                  Status only. As a CSR you can&apos;t open, preview or download client files.
                </Callout>
              ) : null}
              {docs.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{d.name}</span>
                  <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
                  {canFiles && d.file ? (
                    <Button size="sm" variant="ghost" onClick={() => dispatch(openFile(d.id, "Preview")) && setPreview(d.id)}>
                      Preview
                    </Button>
                  ) : null}
                </div>
              ))}
              {docs.length === 0 ? <span className="help">No documents yet.</span> : null}
            </div>
          </>
        ) : null}
        {tab === "timeline" ? (
          <>
            <p className="help">
              Client-facing activity only: messages, follow-ups, case milestones, invitation and ticket updates, and document status. File
              contents, links and Compliance-only notes are never shown here.
            </p>
            <ActivityTimeline entries={timeline} />
            {timeline.length === 0 ? <EmptyState title="No activity yet" /> : null}
          </>
        ) : null}
        {tab === "followups" ? (
          <>
            {canFollowup ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => openDialog({ kind: "reminder" }, "Open add follow-up")}>
                  Add reminder
                </Button>
                <Button size="sm" onClick={() => openDialog({ kind: "interaction" }, "Open record interaction")}>
                  Record interaction
                </Button>
              </div>
            ) : null}
            {followups.map((f) => (
              <div key={f.id} className="row px-0">
                <Badge tone={f.status === "Done" ? "ok" : f.due < today ? "err" : f.due === today ? "warn" : "info"}>{f.status}</Badge>
                <div className="min-w-0 flex-[1_1_200px]">
                  <div className="text-sm font-medium">
                    {f.type} · {f.note}
                  </div>
                  <div className="help">Due {fmtDay(f.due)}</div>
                  {f.outcome ? <div className="help">Outcome: {f.outcome}</div> : null}
                </div>
                {f.status === "Open" ? (
                  <Button size="sm" onClick={() => openDialog({ kind: "complete", id: f.id }, "Open complete follow-up")}>
                    Complete
                  </Button>
                ) : null}
              </div>
            ))}
            {followups.length === 0 ? <EmptyState title="No follow-ups" text="Add a reminder so this client isn't missed." /> : null}
          </>
        ) : null}
      </div>
      {dialog?.kind === "reminder" ? <ReminderDialog clientId={client.id} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "interaction" ? <InteractionDialog clientId={client.id} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "complete" ? <CompleteFollowupDialog followupId={dialog.id} onClose={() => setDialog(null)} /> : null}
      <DocumentPreviewDialog docId={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
