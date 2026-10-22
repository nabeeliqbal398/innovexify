"use client";

import { useState } from "react";

import { AddFollowupDialog, CompleteFollowupDialog, InteractionDialog } from "@/components/features/followups/followup-dialogs";
import { requestFollowupDialog } from "@/components/features/followups/actions";
import { FollowupRow } from "@/components/features/followups/followup-row";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Chip, Count, EmptyState, PageHeader, Timeline, type TimelineItem } from "@/components/ui/primitives";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { dISO, fmtAt } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { userName } from "@/store/selectors";
import type { FollowUp } from "@/types/domain";

type FilterId = "today" | "overdue" | "upcoming" | "done" | "all";
type Dialog = { kind: "add" } | { kind: "interaction" } | { kind: "complete"; id: number } | null;

const FILTERS: ReadonlyArray<{ id: FilterId; label: string; test: (f: FollowUp, today: string) => boolean }> = [
  { id: "today", label: "Due today", test: (f, today) => f.status === "Open" && f.due === today },
  { id: "overdue", label: "Overdue", test: (f, today) => f.status === "Open" && f.due < today },
  { id: "upcoming", label: "Upcoming", test: (f, today) => f.status === "Open" && f.due > today },
  { id: "done", label: "Completed", test: (f) => f.status === "Done" },
  { id: "all", label: "All", test: () => true },
];

interface TimelineEntry {
  key: string;
  kind: string;
  tone: "teal" | "ok";
  text: string;
  who: string;
  client: string;
  at: number;
}

export function FollowupsView({ nav }: ViewProps) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [filter, setFilter] = useState<FilterId>(FILTERS.find((f) => f.id === nav.param("filter"))?.id ?? "today");
  const [dialog, setDialog] = useState<Dialog>(null);
  const today = dISO(0);
  const clientParam = nav.param("client");
  const isCsr = me.role === "CSR";

  const mine = data.followups.filter((f) => {
    const client = data.users.find((u) => u.id === f.client);
    return (
      client !== undefined &&
      can(me, "followups", client) &&
      (!isCsr || f.csr === me.id || client.csr === me.id) &&
      (!clientParam || f.client === clientParam)
    );
  });
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const rows = mine.filter((f) => active.test(f, today)).sort((a, b) => (a.due < b.due ? -1 : 1));

  const entries: TimelineEntry[] = [
    ...data.interactions.flatMap((i): TimelineEntry[] => {
      const client = data.users.find((u) => u.id === i.client);
      if (!client || !can(me, "followups", client) || (isCsr && client.csr !== me.id) || (clientParam && i.client !== clientParam)) return [];
      return [{ key: `i${i.id}`, kind: i.kind, tone: "teal", text: i.text, who: userName(data, i.by), client: client.name, at: i.at }];
    }),
    ...mine
      .filter((f) => f.status === "Done")
      .map(
        (f): TimelineEntry => ({
          key: `f${f.id}`,
          kind: "Follow-up",
          tone: "ok",
          text: `${f.type}: ${f.outcome || f.note}`,
          who: userName(data, f.csr),
          client: userName(data, f.client),
          at: f.doneAt ?? 0,
        }),
      ),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);

  const timelineItems: TimelineItem[] = entries.map((e) => ({
    id: e.key,
    dotClass: "bg-teal",
    content: (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={e.tone} compact>
            {e.kind}
          </Badge>
          <strong className="text-sm">{e.client}</strong>
        </div>
        <div className="mini">{e.text}</div>
        <div className="help">
          {e.who} · {fmtAt(e.at)}
        </div>
      </>
    ),
  }));

  const request = (label: string, next: Dialog) => {
    if (dispatch(requestFollowupDialog(label, clientParam || undefined))) setDialog(next);
  };
  const clientName = userName(data, clientParam);

  return (
    <div className="stack-16">
      <PageHeader
        title="Follow-up center"
        description={isCsr ? "Reminders and client contacts for your assigned clients." : "Follow-ups across all CSRs. CSRs see only their own clients."}
        actions={
          <>
            <Button onClick={() => request("Open record interaction", { kind: "interaction" })}>Record interaction</Button>
            <Button variant="primary" onClick={() => request("Open add follow-up", { kind: "add" })}>
              <Icon name="plus" small />
              Add reminder
            </Button>
          </>
        }
      />
      <div role="group" aria-label="Follow-up filter" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label} <Count>{mine.filter((x) => f.test(x, today)).length}</Count>
          </Chip>
        ))}
        {clientParam ? (
          <Chip active onClick={() => nav.setParams({ client: undefined })} aria-label={`Showing ${clientName} only, clear client filter`}>
            {clientName}
            <Icon name="x" small />
          </Chip>
        ) : null}
      </div>
      <div className="grid2">
        <section className="card overflow-hidden">
          {rows.map((f) => (
            <FollowupRow
              key={f.id}
              followup={f}
              showCsr={!isCsr}
              onComplete={() => request("Open complete follow-up", { kind: "complete", id: f.id })}
              onOpenClient={() => nav.go("clients", { query: { client: f.client, tab: "timeline" } })}
            />
          ))}
          {rows.length === 0 ? (
            <EmptyState
              title="All clear"
              text={filter === "today" ? "Nothing due today. Check Overdue or Upcoming." : "No follow-ups in this view."}
            />
          ) : null}
        </section>
        <section className="card overflow-hidden">
          <div className="card-h">
            <span className="h3 flex-1">Recent client interactions</span>
            <span className="help">Client-facing only</span>
          </div>
          <div className="card-b">
            <Timeline items={timelineItems} />
            {entries.length === 0 ? (
              <EmptyState title="No interactions recorded" text="Record a call, email or meeting so the team can see it." />
            ) : null}
          </div>
        </section>
      </div>
      {dialog?.kind === "add" ? <AddFollowupDialog clientId={clientParam || undefined} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "interaction" ? <InteractionDialog clientId={clientParam || undefined} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "complete" ? <CompleteFollowupDialog followupId={dialog.id} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
