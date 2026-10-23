"use client";

import { useState } from "react";

import { QueryState } from "@/components/common/query-state";
import { ActivityTimeline } from "@/components/features/cases/activity-timeline";
import { DocumentPreviewDialog } from "@/components/features/cases/document-preview-dialog";
import { AddFollowupDialog, CompleteFollowupDialog, InteractionDialog } from "@/components/features/followups/followup-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Callout, CardHeader, Facts, Progress, Tabs, type SegmentOption } from "@/components/ui/primitives";
import { DOC_STATUS, STAGES } from "@/constants/vocab";
import { useMe } from "@/hooks/useStore";
import { fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useCaseDocumentsQuery, useClientTimelineQuery, useFollowUpsQuery, useOpenTicketCountQuery } from "@/store/api/cases";
import type { FollowUp, User } from "@/types/domain";

type ClientTab = "overview" | "timeline" | "followups";
const TABS: Array<SegmentOption<ClientTab>> = [
  { value: "overview", label: "Overview" },
  { value: "timeline", label: "Relationship timeline" },
  { value: "followups", label: "Follow-ups" },
];

type Dialog = { kind: "reminder" } | { kind: "interaction" } | { kind: "complete"; followup: FollowUp } | null;

const utcToday = (): string => new Date().toISOString().slice(0, 10);

/** Expanded profile for one client, opened with `?client=<id>`. `onOpenCase` receives the case's API id. */
export function ClientProfile({ client, onClose, onOpenCase }: { client: User; onClose: () => void; onOpenCase: (caseApiId: string) => void }) {
  const me = useMe();
  const [tab, setTab] = useState<ClientTab>("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const project = client.currentCase ?? null;
  const ob = client.onboarding ?? { done: 0, total: 5 };
  const obPct = Math.round((ob.done / Math.max(1, ob.total)) * 100);
  const canFiles = can(me, "docsAccess", { client: client.id });
  const canFollowup = can(me, "followups", { csr: client.csr });
  const today = utcToday();

  const docs = useCaseDocumentsQuery(client.id, { skip: tab !== "overview" });
  const tickets = useOpenTicketCountQuery(client.id, { skip: tab !== "overview" });
  const timeline = useClientTimelineQuery({ clientId: client.id, relationship: true, limit: 30 }, { skip: tab !== "timeline" });
  const followups = useFollowUpsQuery({ clientId: client.id, limit: 50, sort: "due", order: "desc" }, { skip: tab !== "followups" || !canFollowup });
  const csrName = client.csrName ?? "Unassigned";

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
                { label: "Open tickets", value: tickets.data ?? "…" },
                {
                  label: "Onboarding",
                  value: (
                    <span className="flex items-center gap-1.5">
                      <Progress value={obPct} label="Onboarding progress" className="max-w-[140px] flex-1" />
                      <span className="mono">{ob.done}/{ob.total}</span>
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
              <QueryState query={docs} isEmpty={(docs.data ?? []).length === 0} empty={{ title: "No documents yet" }} rows={2}>
                {(docs.data ?? []).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{d.name}</span>
                    <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
                    {canFiles && d.hasFile ? (
                      <Button size="sm" variant="ghost" onClick={() => setPreview(d.id)}>
                        Preview
                      </Button>
                    ) : null}
                  </div>
                ))}
              </QueryState>
            </div>
          </>
        ) : null}
        {tab === "timeline" ? (
          <>
            <p className="help">
              Client-facing activity only: messages, follow-ups, case milestones, invitation and ticket updates, and document status. File
              contents, links and Compliance-only notes are never shown here.
            </p>
            <QueryState query={timeline} isEmpty={(timeline.data ?? []).length === 0} empty={{ title: "No activity yet" }} rows={4}>
              <ActivityTimeline entries={timeline.data ?? []} />
            </QueryState>
          </>
        ) : null}
        {tab === "followups" ? (
          <>
            {canFollowup ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => setDialog({ kind: "reminder" })}>
                  Add reminder
                </Button>
                <Button size="sm" onClick={() => setDialog({ kind: "interaction" })}>
                  Record interaction
                </Button>
              </div>
            ) : (
              <Callout tone="lock" icon="lock">
                Follow-ups are limited to the client&apos;s CSR, Manager and Admin.
              </Callout>
            )}
            {canFollowup ? (
              <QueryState query={followups} isEmpty={(followups.data?.items ?? []).length === 0} empty={{ title: "No follow-ups", text: "Add a reminder so this client isn't missed." }} rows={3}>
                {(followups.data?.items ?? []).map((f) => (
                  <div key={f.id} className="row px-0">
                    <Badge tone={f.status === "Done" ? "ok" : f.overdue ? "err" : f.due === today ? "warn" : "info"}>{f.status}</Badge>
                    <div className="min-w-0 flex-[1_1_200px]">
                      <div className="text-sm font-medium">
                        {f.type} · {f.note}
                      </div>
                      <div className="help">Due {fmtDay(f.due)}</div>
                      {f.outcome ? <div className="help">Outcome: {f.outcome}</div> : null}
                    </div>
                    {f.status === "Open" ? (
                      <Button size="sm" onClick={() => setDialog({ kind: "complete", followup: f })}>
                        Complete
                      </Button>
                    ) : null}
                  </div>
                ))}
              </QueryState>
            ) : null}
          </>
        ) : null}
      </div>
      {dialog?.kind === "reminder" ? <AddFollowupDialog clientId={client.id} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "interaction" ? <InteractionDialog clientId={client.id} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "complete" ? <CompleteFollowupDialog followup={dialog.followup} onClose={() => setDialog(null)} /> : null}
      <DocumentPreviewDialog docId={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
