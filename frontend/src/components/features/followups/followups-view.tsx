"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { AddFollowupDialog, CompleteFollowupDialog, InteractionDialog } from "@/components/features/followups/followup-dialogs";
import { FollowupRow } from "@/components/features/followups/followup-row";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Chip, Count, PageHeader, Timeline, type TimelineItem } from "@/components/ui/primitives";
import { useMe } from "@/hooks/useStore";
import { fmtAt } from "@/lib/dates";
import { useFollowUpsQuery, useRecentInteractionsQuery, type ListFollowUpsParams } from "@/store/api/cases";
import type { FollowUp } from "@/types/domain";

type FilterId = "today" | "overdue" | "upcoming" | "done" | "all";
type Dialog = { kind: "add" } | { kind: "interaction" } | { kind: "complete"; followup: FollowUp } | null;

const PAGE_SIZE = 10;
const FILTERS: ReadonlyArray<{ id: FilterId; label: string; params: ListFollowUpsParams }> = [
  { id: "today", label: "Due today", params: { filter: "today" } },
  { id: "overdue", label: "Overdue", params: { filter: "overdue" } },
  { id: "upcoming", label: "Upcoming", params: { filter: "upcoming" } },
  { id: "done", label: "Completed", params: { status: "DONE", sort: "doneAt", order: "desc" } },
  { id: "all", label: "All", params: {} },
];

const utcToday = (): string => new Date().toISOString().slice(0, 10);

/** A chip's number: the server's total for that filter (a one-row query, so the page is not loaded twice). */
function FilterChip({ filter, active, clientId, onClick }: { filter: (typeof FILTERS)[number]; active: boolean; clientId?: string; onClick: () => void }) {
  const count = useFollowUpsQuery({ ...filter.params, ...(clientId ? { clientId } : {}), limit: 1 });
  return (
    <Chip active={active} onClick={onClick}>
      {filter.label} <Count>{count.data?.meta.total ?? "…"}</Count>
    </Chip>
  );
}

export function FollowupsView({ nav }: ViewProps) {
  const me = useMe();
  const [filter, setFilter] = useState<FilterId>(FILTERS.find((f) => f.id === nav.param("filter"))?.id ?? "today");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const clientParam = nav.param("client");
  const isCsr = me.role === "CSR";
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];

  const list = useFollowUpsQuery({ ...active.params, ...(clientParam ? { clientId: clientParam } : {}), page, limit: PAGE_SIZE });
  const recent = useRecentInteractionsQuery({ ...(clientParam ? { clientId: clientParam } : {}), limit: 12 });
  const rows = list.data?.items ?? [];
  const meta = list.data?.meta;
  const today = utcToday();

  const timelineItems: TimelineItem[] = (recent.data?.items ?? []).map((i) => ({
    id: i.id,
    dotClass: "bg-teal",
    content: (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="teal" compact>
            {i.kind}
          </Badge>
          <strong className="text-sm">{i.clientName}</strong>
        </div>
        <div className="mini">{i.text}</div>
        <div className="help">
          {i.byName} · {fmtAt(i.at)}
        </div>
      </>
    ),
  }));

  const clientName = rows.find((f) => f.client === clientParam)?.clientName ?? recent.data?.items.find((i) => i.client === clientParam)?.clientName ?? "this client";

  return (
    <div className="stack-16">
      <PageHeader
        title="Follow-up center"
        description={isCsr ? "Reminders and client contacts for your assigned clients." : "Follow-ups across all CSRs. CSRs see only their own clients."}
        actions={
          <>
            <Button onClick={() => setDialog({ kind: "interaction" })}>Record interaction</Button>
            <Button variant="primary" onClick={() => setDialog({ kind: "add" })}>
              <Icon name="plus" small />
              Add reminder
            </Button>
          </>
        }
      />
      <div role="group" aria-label="Follow-up filter" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <FilterChip
            key={f.id}
            filter={f}
            active={filter === f.id}
            clientId={clientParam || undefined}
            onClick={() => {
              setFilter(f.id);
              setPage(1);
            }}
          />
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
          <QueryState
            query={list}
            isEmpty={rows.length === 0}
            empty={{ title: "All clear", text: filter === "today" ? "Nothing due today. Check Overdue or Upcoming." : "No follow-ups in this view." }}
            rows={4}
          >
            {rows.map((f) => (
              <FollowupRow
                key={f.id}
                followup={f}
                showCsr={!isCsr}
                today={today}
                onComplete={() => setDialog({ kind: "complete", followup: f })}
                onOpenClient={() => nav.go("clients", { query: { client: f.client, tab: "timeline" } })}
              />
            ))}
          </QueryState>
          {meta && meta.total > PAGE_SIZE ? (
            <Pager
              page={meta.page - 1}
              pageCount={meta.totalPages}
              total={meta.total}
              pageSize={PAGE_SIZE}
              noun="follow-ups"
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : null}
        </section>
        <section className="card overflow-hidden">
          <div className="card-h">
            <span className="h3 flex-1">Recent client interactions</span>
            <span className="help">Client-facing only</span>
          </div>
          <div className="card-b">
            <QueryState
              query={recent}
              isEmpty={timelineItems.length === 0}
              empty={{ title: "No interactions recorded", text: "Record a call, email or meeting so the team can see it." }}
              rows={3}
            >
              <Timeline items={timelineItems} />
            </QueryState>
          </div>
        </section>
      </div>
      {dialog?.kind === "add" ? <AddFollowupDialog clientId={clientParam || undefined} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "interaction" ? <InteractionDialog clientId={clientParam || undefined} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "complete" ? <CompleteFollowupDialog followup={dialog.followup} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
