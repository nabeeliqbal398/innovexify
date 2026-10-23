"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState, Skeleton } from "@/components/common/query-state";
import { DocumentPreviewDialog } from "@/components/features/documents/document-preview-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Select } from "@/components/ui/form";
import { Chip, Count, Timeline } from "@/components/ui/primitives";
import { DOC_STATUS, DOC_TYPES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { DOC_STATUS_MAP, DOC_TYPE } from "@/lib/api-mappers";
import { cn } from "@/lib/cn";
import { fmtAt } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useDocumentQuery, useDocumentsQuery, useReviewDocumentMutation } from "@/store/api/documents";
import { useClientsQuery } from "@/store/api/people";
import type { ClientDoc, DocStatus } from "@/types/domain";

type QueueStatus = DocStatus | "all";
type Sort = "new" | "old";
const PAGE_SIZE = 10;

const TABS: ReadonlyArray<{ key: QueueStatus; label: string }> = [
  { key: "submitted", label: "Awaiting review" },
  { key: "info", label: "More info requested" },
  { key: "rejected", label: "Needs correction" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All submissions" },
];

const HISTORY_DOT = "bg-[#A5B4FC]";

/** How many documents a tab would show: a one-row query that only reads the total. */
function useTabCount(status: QueueStatus, clientId: string, type: string): number | undefined {
  const { total } = useDocumentsQuery(
    {
      limit: 1,
      ...(status === "all" ? { group: "submissions" } : { status: DOC_STATUS_MAP.toKey(status) }),
      clientId: clientId || undefined,
      type: type ? DOC_TYPE.toKey(type) : undefined,
    },
    { selectFromResult: (r) => ({ total: r.data?.meta.total }) },
  );
  return total;
}

function TabChip({ tab, active, client, type, onClick }: { tab: (typeof TABS)[number]; active: boolean; client: string; type: string; onClick: () => void }) {
  const n = useTabCount(tab.key, client, type);
  return (
    <Chip active={active} onClick={onClick}>
      {tab.label} <Count>{n ?? "…"}</Count>
    </Chip>
  );
}

interface QueueRowProps {
  doc: ClientDoc;
  focused: boolean;
  onPreview: (id: string) => void;
}

function QueueRow({ doc, focused, onPreview }: QueueRowProps) {
  const me = useMe();
  const run = useAction();
  const [review, { isLoading }] = useReviewDocumentMutation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const detail = useDocumentQuery(doc.id, { skip: !historyOpen });

  const status = DOC_STATUS[doc.status];
  const canReview = can(me, "docsReview");
  const pending = doc.status === "submitted";
  const noReason = !reason.trim();

  const decide = async (decision: "APPROVED" | "REJECTED" | "INFO") => {
    const outcome = await run(review({ id: doc.id, decision, reason: reason.trim() || undefined }), { quiet: true });
    if (outcome.ok) {
      setReason("");
      setError("");
    } else if (outcome.error.errorCode !== "PERMISSION_DENIED" && outcome.error.errorCode !== "CONCURRENT_MODIFICATION") {
      setError(outcome.error.fieldErrors[0]?.message ?? outcome.error.message);
    }
  };

  const history = [...(detail.data?.history ?? [])].reverse();

  return (
    <div id={`doc-${doc.id}`} className={cn("row flex-col items-start gap-2.5", focused && "bg-primary-soft")}>
      <div className="flex w-full flex-wrap items-start gap-3">
        <div className="min-w-0 flex-[1_1_260px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{doc.file || doc.name}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="help">
            “{doc.name}” · {doc.type || "Other"} · {doc.clientName} · <span className="mono">{doc.clientCaseId}</span> · submitted{" "}
            {doc.submittedAt ? fmtAt(doc.submittedAt) : "—"}
          </div>
          {doc.reviewedByName ? (
            <div className="help">
              Last decision: {doc.reviewedByName} · {fmtAt(doc.reviewedAt)}
            </div>
          ) : null}
          {doc.reason ? <div className="mini">Shown to client: “{doc.reason}”</div> : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {doc.file ? (
              <Button size="sm" onClick={() => onPreview(doc.id)}>
                <Icon name="eye" small />
                Preview
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" aria-expanded={historyOpen} onClick={() => setHistoryOpen((o) => !o)}>
              {historyOpen ? "Hide history" : "Review history"}
            </Button>
          </div>
        </div>
        {pending ? (
          <div className="stack-8 flex-[1_1_300px]">
            <label className="sr-only" htmlFor={`rr${doc.id}`}>
              Reason shown to the client
            </label>
            <Input
              id={`rr${doc.id}`}
              placeholder="Reason shown to the client (required to reject)"
              value={reason}
              invalid={Boolean(error)}
              onChange={(e) => {
                setReason(e.target.value);
                setError("");
              }}
            />
            {error ? (
              <span role="alert" className="errtxt">
                {error}
              </span>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={canReview ? "ok" : "locked"} disabled={isLoading} onClick={() => void decide("APPROVED")}>
                {canReview ? null : <Icon name="lock" small />}
                Approve
              </Button>
              <Button size="sm" variant={canReview ? "bad" : "locked"} disabled={(canReview && noReason) || isLoading} onClick={() => void decide("REJECTED")}>
                {canReview ? null : <Icon name="lock" small />}
                Reject
              </Button>
              <Button size="sm" variant={canReview ? "default" : "locked"} disabled={(canReview && noReason) || isLoading} onClick={() => void decide("INFO")}>
                {canReview ? null : <Icon name="lock" small />}
                Request more information
              </Button>
            </div>
            <span className="help">Rejecting or asking for more information needs a reason. The client sees it with the request.</span>
          </div>
        ) : null}
      </div>
      {historyOpen ? (
        <div className="w-full pl-1">
          {detail.isLoading ? <Skeleton rows={2} /> : null}
          <Timeline
            items={history.map((h, i) => {
              const s = DOC_STATUS[h.status];
              return {
                id: `${doc.id}-${i}`,
                dotClass: HISTORY_DOT,
                content: (
                  <>
                    <Badge tone={s.tone} compact>
                      {s.label}
                    </Badge>{" "}
                    <span className="help">
                      {h.byName ?? "—"} · {fmtAt(h.at)}
                    </span>
                    {h.status !== "submitted" && h.note ? <div className="mini">{h.note}</div> : null}
                  </>
                ),
              };
            })}
          />
        </div>
      ) : null}
    </div>
  );
}

interface ReviewQueueProps {
  /** Document opened by a deep link (`?doc=<id>`); it is shown first and highlighted. */
  focusId: string;
}

export function ReviewQueue({ focusId }: ReviewQueueProps) {
  const [status, setStatus] = useState<QueueStatus>("submitted");
  const [client, setClient] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [page, setPage] = useState(1);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const clients = useClientsQuery({ limit: 100, sort: "name", order: "asc" });
  const result = useDocumentsQuery({
    ...(status === "all" ? { group: "submissions" } : { status: DOC_STATUS_MAP.toKey(status) }),
    clientId: client || undefined,
    type: type ? DOC_TYPE.toKey(type) : undefined,
    sort: "submittedAt",
    order: sort === "old" ? "asc" : "desc",
    page,
    limit: PAGE_SIZE,
  });
  const awaiting = useTabCount("submitted", "", "");
  const linked = useDocumentQuery(focusId, { skip: !focusId });
  const list = result.data?.items ?? [];
  const meta = result.data?.meta;
  const showLinked = Boolean(linked.data) && !list.some((d) => d.id === focusId);
  const clean = status === "submitted" && !client && !type;
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <section className="card overflow-hidden">
      <div className="card-h flex-col items-stretch gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h3">Review queue</span>
          <Badge tone="warn">{awaiting ?? "…"} awaiting review</Badge>
        </div>
        <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <TabChip key={t.key} tab={t} active={status === t.key} client={client} type={type} onClick={() => reset(setStatus)(t.key)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Filter by client" className="w-auto" value={client} onChange={(e) => reset(setClient)(e.target.value)}>
            <option value="">All clients</option>
            {(clients.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by document type" className="w-auto" value={type} onChange={(e) => reset(setType)(e.target.value)}>
            <option value="">All types</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort by submission date" className="w-auto" value={sort} onChange={(e) => reset(setSort)(e.target.value as Sort)}>
            <option value="new">Newest submissions first</option>
            <option value="old">Oldest submissions first</option>
          </Select>
        </div>
      </div>
      {showLinked && linked.data ? (
        <div className="border-b border-border">
          <div className="help px-3.5 pt-2">Opened from a link</div>
          <QueueRow doc={linked.data} focused onPreview={setPreviewId} />
        </div>
      ) : null}
      <QueryState
        query={result}
        isEmpty={list.length === 0}
        empty={{ title: "Nothing here", text: clean ? "The review queue is clear. New client uploads appear here." : "No documents match these filters." }}
      >
        {list.map((d) => (
          <QueueRow key={d.id} doc={d} focused={d.id === focusId} onPreview={setPreviewId} />
        ))}
        {meta ? (
          <Pager
            page={meta.page - 1}
            pageCount={meta.totalPages}
            total={meta.total}
            pageSize={PAGE_SIZE}
            noun="documents"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        ) : null}
      </QueryState>
      <DocumentPreviewDialog docId={previewId} onClose={() => setPreviewId(null)} />
    </section>
  );
}
