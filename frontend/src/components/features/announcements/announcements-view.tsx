"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { ErrorState, QueryState, Skeleton } from "@/components/common/query-state";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, PageHeader } from "@/components/ui/primitives";
import { type BadgeTone } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { fmtAt, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import {
  useAcknowledgeAnnouncementMutation,
  useAnnouncementAcksQuery,
  useAnnouncementsQuery,
  useArchiveAnnouncementMutation,
  usePublishAnnouncementMutation,
} from "@/store/api/announcements";
import type { Announcement, AnnouncementPriority, AnnouncementStatus } from "@/types/domain";

import { AnnouncementForm } from "./announcement-form";

const PRIORITY_TONE: Record<AnnouncementPriority, BadgeTone> = { Urgent: "err", Important: "warn", Normal: "q" };
const STATUS_TONE: Record<AnnouncementStatus, BadgeTone> = { Published: "ok", Draft: "q", Archived: "violet" };
const PAGE_SIZE = 10;
const FILTERS: ReadonlyArray<{ key: string; label: string; status?: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts", status: "DRAFT" },
  { key: "published", label: "Published", status: "PUBLISHED" },
  { key: "archived", label: "Archived", status: "ARCHIVED" },
];

/** Who has acknowledged an announcement, and who has not. */
function AckPanel({ id }: { id: string }) {
  const acks = useAnnouncementAcksQuery(id);
  if (acks.isLoading) return <Skeleton rows={2} />;
  if (acks.isError) return <ErrorState error={acks.error} onRetry={() => void acks.refetch()} />;
  const data = acks.data;
  if (!data) return null;
  return (
    <div className="flex w-full flex-col gap-1 border-t border-muted pt-2 text-sm" aria-label="Acknowledgements">
      <strong>
        {data.done} of {data.total} acknowledged
      </strong>
      {data.clients.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <Badge tone={c.acknowledged ? "ok" : "warn"} compact>
            {c.acknowledged ? "Acknowledged" : "Waiting"}
          </Badge>
          <span className="flex-1">
            {c.name} <span className="mono help">{c.caseId}</span>
          </span>
          <span className="help">{c.at ? fmtAt(c.at) : ""}</span>
        </div>
      ))}
      {data.clients.length === 0 ? <span className="help">No clients to acknowledge it.</span> : null}
    </div>
  );
}

/** Publish to all clients or one client, and track acknowledgements. A row opens with `?announcement=<id>`. */
export function AnnouncementsView({ nav }: Partial<ViewProps>) {
  const me = useMe();
  const run = useAction();
  const canAnnounce = can(me, "announce");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [showAcks, setShowAcks] = useState<string | null>(nav?.param("announcement") || null);
  const status = FILTERS.find((f) => f.key === filter)?.status;
  const list = useAnnouncementsQuery({ status, page, limit: PAGE_SIZE });
  const [publish] = usePublishAnnouncementMutation();
  const [archive] = useArchiveAnnouncementMutation();
  const [acknowledge] = useAcknowledgeAnnouncementMutation();
  const rows = list.data?.items ?? [];
  const meta = list.data?.meta;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Announcements"
        description={
          canAnnounce
            ? "Publish to all clients or one client. Clients only ever see announcements meant for them."
            : "What your clients currently see. Only Admin, Manager and Compliance publish announcements."
        }
      />
      {canAnnounce ? <AnnouncementForm key={editing?.id ?? "new"} editing={editing} onDone={() => setEditing(null)} /> : null}
      {canAnnounce ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Announcement filter">
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              active={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      ) : null}
      <section className="card overflow-hidden">
        <QueryState query={list} isEmpty={rows.length === 0} empty={{ title: "No announcements yet" }} rows={3}>
          {rows.map((a, i) => (
            <div key={a.id} className={i === 0 ? "row border-t-0" : "row"}>
              <div className="min-w-0 flex-[1_1_220px]">
                <div className="font-semibold">{a.title}</div>
                <div className="help">{a.msg}</div>
                <div className="help">
                  {a.audName}
                  {canAnnounce ? ` · by ${a.byName}` : ""} · {a.date ? fmtDay(a.date) : "not published"}
                  {a.exp ? ` · expires ${fmtDay(a.exp)}` : ""}
                </div>
              </div>
              <Badge tone={PRIORITY_TONE[a.prio]}>{a.prio}</Badge>
              <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
              <span className="help">{a.acks ? `${a.acks.done}/${a.acks.total} acknowledged` : ""}</span>
              {a.status === "Draft" && canAnnounce ? (
                <>
                  <Button size="sm" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => void run(publish(a.id), { success: "Published. Clients were notified in-app." })}>
                    Publish
                  </Button>
                </>
              ) : null}
              {a.status === "Published" && canAnnounce ? (
                <Button size="sm" onClick={() => void run(archive(a.id), { success: "Archived." })}>
                  Archive
                </Button>
              ) : null}
              {a.ack && canAnnounce && a.status !== "Draft" ? (
                <Button size="sm" onClick={() => setShowAcks(showAcks === a.id ? null : a.id)} aria-expanded={showAcks === a.id}>
                  Who acknowledged
                </Button>
              ) : null}
              {a.ack && !canAnnounce && !a.acked ? (
                <Button size="sm" variant="primary" onClick={() => void run(acknowledge(a.id), { success: "Acknowledged." })}>
                  Acknowledge
                </Button>
              ) : null}
              {showAcks === a.id ? <AckPanel id={a.id} /> : null}
            </div>
          ))}
          {meta ? (
            <Pager
              page={meta.page - 1}
              pageCount={meta.totalPages}
              total={meta.total}
              pageSize={PAGE_SIZE}
              noun="announcements"
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : null}
        </QueryState>
      </section>
    </div>
  );
}
