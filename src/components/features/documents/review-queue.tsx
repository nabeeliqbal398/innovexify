"use client";

import { useState } from "react";

import { DocumentPreviewDialog } from "@/components/features/documents/document-preview-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Select } from "@/components/ui/form";
import { Chip, Count, EmptyState, Timeline } from "@/components/ui/primitives";
import { DOC_STATUS, DOC_TYPES, ROLE_LABEL } from "@/constants/vocab";
import { fmtAt } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { openFile, reviewDocument } from "@/store/actions/comms";
import { userById, userName } from "@/store/selectors";
import type { ClientDoc, DocStatus } from "@/types/domain";

type QueueStatus = DocStatus | "all";
type Sort = "new" | "old";

const TABS: ReadonlyArray<{ key: QueueStatus; label: string }> = [
  { key: "submitted", label: "Awaiting review" },
  { key: "info", label: "More info requested" },
  { key: "rejected", label: "Needs correction" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All submissions" },
];

const HISTORY_DOT = "bg-[#A5B4FC]";

interface QueueRowProps {
  doc: ClientDoc;
  focused: boolean;
  onPreview: (id: number) => void;
}

function QueueRow({ doc, focused, onPreview }: QueueRowProps) {
  const dispatch = useAppDispatch();
  const data = useData();
  const me = useMe();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const client = userById(data, doc.client);
  const status = DOC_STATUS[doc.status];
  const canReview = can(me, "docsReview");
  const pending = doc.status === "submitted";
  const noReason = !reason.trim();

  const decide = (decision: "approved" | "rejected" | "info") => {
    const result = dispatch(reviewDocument(doc.id, decision, reason));
    if (result.ok) {
      setReason("");
      setError("");
    } else if (result.error && result.error !== "Not allowed.") {
      setError(result.error);
    }
  };

  const preview = () => {
    if (dispatch(openFile(doc.id, "Preview"))) onPreview(doc.id);
  };

  const history = [...doc.history].reverse();

  return (
    <div id={`doc-${doc.id}`} className={cn("row flex-col items-start gap-2.5", focused && "bg-primary-soft")}>
      <div className="flex w-full flex-wrap items-start gap-3">
        <div className="min-w-0 flex-[1_1_260px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{doc.file}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="help">
            “{doc.name}” · {doc.type || "Other"} · {client?.name} · <span className="mono">{client?.caseId}</span> · submitted{" "}
            {doc.submittedAt ? fmtAt(doc.submittedAt) : "—"}
          </div>
          {doc.reviewedBy ? <div className="help">Last decision: {userName(data, doc.reviewedBy)} · {fmtAt(doc.reviewedAt)}</div> : null}
          {doc.reason ? <div className="mini">Shown to client: “{doc.reason}”</div> : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Button size="sm" onClick={preview}>
              <Icon name="eye" small />
              Preview
            </Button>
            <Button size="sm" variant="ghost" aria-expanded={historyOpen} onClick={() => setHistoryOpen((o) => !o)}>
              {historyOpen ? "Hide history" : `Review history (${doc.history.length})`}
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
              <Button size="sm" variant={canReview ? "ok" : "locked"} onClick={() => decide("approved")}>
                {canReview ? null : <Icon name="lock" small />}
                Approve
              </Button>
              <Button size="sm" variant={canReview ? "bad" : "locked"} disabled={canReview && noReason} onClick={() => decide("rejected")}>
                {canReview ? null : <Icon name="lock" small />}
                Reject
              </Button>
              <Button size="sm" variant={canReview ? "default" : "locked"} disabled={canReview && noReason} onClick={() => decide("info")}>
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
          <Timeline
            items={history.map((h, i) => {
              const s = DOC_STATUS[h.status];
              const actor = userById(data, h.by);
              return {
                id: `${doc.id}-${i}`,
                dotClass: HISTORY_DOT,
                content: (
                  <>
                    <Badge tone={s.tone} compact>
                      {s.label}
                    </Badge>{" "}
                    <span className="help">
                      {actor?.name ?? "—"} · {actor ? ROLE_LABEL[actor.role] : ""} · {fmtAt(h.at)}
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
  /** Document opened by a deep link; it is highlighted and its tab is shown. */
  focusId: number;
}

export function ReviewQueue({ focusId }: ReviewQueueProps) {
  const data = useData();
  const [status, setStatus] = useState<QueueStatus>(focusId ? "all" : "submitted");
  const [client, setClient] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [previewId, setPreviewId] = useState<number | null>(null);

  const subs = data.docs.filter((d) => d.status !== "requested" && d.status !== "shared");
  const list = subs
    .filter((d) => (status === "all" || d.status === status) && (!client || d.client === client) && (!type || (d.type || "Other") === type))
    .sort((a, b) => ((a.submittedAt ?? 0) - (b.submittedAt ?? 0)) * (sort === "old" ? 1 : -1));
  const awaiting = subs.filter((d) => d.status === "submitted").length;
  const clientOptions = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed" && subs.some((d) => d.client === u.id));
  const clean = status === "submitted" && !client && !type;

  return (
    <section className="card overflow-hidden">
      <div className="card-h flex-col items-stretch gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h3">Review queue</span>
          <Badge tone="warn">{awaiting} awaiting review</Badge>
        </div>
        <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <Chip key={t.key} active={status === t.key} onClick={() => setStatus(t.key)}>
              {t.label} <Count>{t.key === "all" ? subs.length : subs.filter((d) => d.status === t.key).length}</Count>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Filter by client" className="w-auto" value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">All clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by document type" className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort by submission date" className="w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="new">Newest submissions first</option>
            <option value="old">Oldest submissions first</option>
          </Select>
        </div>
      </div>
      {list.map((d) => (
        <QueueRow key={d.id} doc={d} focused={d.id === focusId} onPreview={setPreviewId} />
      ))}
      {list.length === 0 ? (
        <EmptyState
          title="Nothing here"
          text={clean ? "The review queue is clear. New client uploads appear here." : "No documents match these filters."}
        />
      ) : null}
      <DocumentPreviewDialog docId={previewId} onClose={() => setPreviewId(null)} />
    </section>
  );
}
