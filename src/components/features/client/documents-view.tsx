"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState, Skeleton } from "@/components/common/query-state";
import { FileButton } from "@/components/features/client/client-shared";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Callout, Card, Chip, Count, PageHeader, Timeline } from "@/components/ui/primitives";
import { Facts } from "@/components/ui/primitives";
import { DOC_STATUS } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useDocumentDownload } from "@/hooks/useDocumentFile";
import { cn } from "@/lib/cn";
import { DOC_STATUS_MAP } from "@/lib/api-mappers";
import { fmtAt } from "@/lib/dates";
import { FILE_ACCEPT, MAX_FILE_MB, validateFile } from "@/lib/file-rules";
import { useCompanyQuery } from "@/store/api/system";
import { useDocumentQuery, useDocumentsQuery, useUploadDocumentMutation } from "@/store/api/documents";
import type { ClientDoc, DocStatus } from "@/types/domain";

type Tab = "all" | DocStatus;
const PAGE_SIZE = 10;
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "submitted", label: "Uploaded · under review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Needs correction" },
  { value: "info", label: "More info needed" },
  { value: "shared", label: "Shared with you" },
];

const needsUpload = (d: ClientDoc) => d.status === "requested" || d.status === "rejected" || d.status === "info";
const canDownload = (d: ClientDoc) => Boolean(d.file) && (d.status === "approved" || d.status === "shared" || d.status === "submitted");

function TabChip({ tab, active, onClick }: { tab: (typeof TABS)[number]; active: boolean; onClick: () => void }) {
  const { total } = useDocumentsQuery(
    { limit: 1, ...(tab.value === "all" ? {} : { status: DOC_STATUS_MAP.toKey(tab.value) }) },
    { selectFromResult: (r) => ({ total: r.data?.meta.total }) },
  );
  return (
    <Chip active={active} onClick={onClick}>
      {tab.label}
      <Count>{total ?? "…"}</Count>
    </Chip>
  );
}

/** Client Documents: requests, uploads checked by the server, reviewer notes and history. Deep link: `?doc=<document id>`. */
export function ClientDocumentsView({ nav }: ViewProps) {
  const run = useAction();
  const { download, busyId } = useDocumentDownload();
  const [upload, uploading] = useUploadDocumentMutation();
  const company = useCompanyQuery().data?.name ?? "Innovexify";
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [uploadErr, setUploadErr] = useState("");

  const result = useDocumentsQuery({ ...(tab === "all" ? {} : { status: DOC_STATUS_MAP.toKey(tab) }), sort: "requestedAt", order: "desc", page, limit: PAGE_SIZE });
  const waiting = useDocumentsQuery({ group: "outstanding", limit: 1 }, { selectFromResult: (r) => ({ total: r.data?.meta.total }) });
  const rows = result.data?.items ?? [];
  const meta = result.data?.meta;
  const openId = nav.param("doc");

  const select = (id: string) => {
    setUploadErr("");
    nav.setParams({ doc: id });
  };
  const send = async (doc: ClientDoc, file: File | null) => {
    const err = validateFile(file);
    if (err || !file) {
      setUploadErr(err);
      nav.setParams({ doc: doc.id });
      return;
    }
    // Only a first look: the server checks the real content, size and name, and its message is the one shown.
    const outcome = await run(upload({ id: doc.id, file }), { success: `${doc.name} uploaded for review`, quiet: true });
    setUploadErr(outcome.ok || outcome.error.errorCode === "PERMISSION_DENIED" ? "" : outcome.error.message);
  };

  return (
    <div className="stack-16">
      <PageHeader
        title="Documents"
        description={`Only you and authorized ${company} reviewers can see these files.`}
        actions={waiting.total ? <Badge tone="warn" className="h-7">{waiting.total} waiting on you</Badge> : null}
      />
      <div role="group" aria-label="Document status" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <TabChip
            key={t.value}
            tab={t}
            active={tab === t.value}
            onClick={() => {
              setTab(t.value);
              setPage(1);
            }}
          />
        ))}
      </div>
      {uploadErr ? (
        <Callout tone="warn" icon="alert" role="alert">
          {uploadErr}
        </Callout>
      ) : null}
      <div className="grid2">
        <Card>
          <QueryState
            query={result}
            isEmpty={rows.length === 0}
            empty={{ title: "Nothing here", text: tab === "all" ? "No documents yet. Requests from your team will appear here." : "No documents in this view." }}
          >
            {rows.map((d) => {
              const status = DOC_STATUS[d.status];
              return (
                <div key={d.id} className={cn("row items-start", openId === d.id && "bg-primary-soft")}>
                  <div className="flex min-w-[220px] flex-1 flex-col gap-[3px]">
                    <button type="button" className="linkb font-medium" aria-current={openId === d.id || undefined} onClick={() => select(d.id)}>
                      {d.name}
                    </button>
                    <span className="help">
                      {d.type || "Other"} · {d.file || "Requested by your team"}
                    </span>
                    {d.status === "rejected" ? <Callout tone="warn">Needs a replacement: {d.reason}</Callout> : null}
                    {d.status === "info" ? <Callout tone="lock">More information needed: {d.reason}</Callout> : null}
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {needsUpload(d) ? (
                    <FileButton ariaLabel={`Upload ${d.name}`} accept={FILE_ACCEPT} onFile={(f) => void send(d, f)}>
                      {uploading.isLoading && uploading.originalArgs?.id === d.id ? "Uploading…" : "Upload"}
                    </FileButton>
                  ) : null}
                  {canDownload(d) ? (
                    <Button size="sm" variant="ghost" disabled={busyId === d.id} onClick={() => void download(d.id)}>
                      {busyId === d.id ? "Downloading…" : "Download"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
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
        </Card>

        <Card aria-label="Document details" className={cn(!openId && "max-[860px]:hidden")}>
          {openId ? (
            <DocDetail
              id={openId}
              busy={uploading.isLoading}
              onClose={() => {
                setUploadErr("");
                nav.setParams({ doc: undefined });
              }}
              onFile={(doc, f) => void send(doc, f)}
              onDownload={(id) => void download(id)}
            />
          ) : (
            <div className="empty-s py-10">
              <strong>Select a document</strong>
              <span className="help">See what was requested, reviewer notes and the full history.</span>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

interface DocDetailProps {
  id: string;
  busy: boolean;
  onClose: () => void;
  onFile: (doc: ClientDoc, file: File | null) => void;
  onDownload: (id: string) => void;
}

function DocDetail({ id, busy, onClose, onFile, onDownload }: DocDetailProps) {
  const query = useDocumentQuery(id);
  const doc = query.data;
  const status = doc ? DOC_STATUS[doc.status] : null;
  const history = (doc?.history ?? []).slice().reverse();

  return (
    <>
      <div className="card-h">
        <span className="h3 flex-1">{doc?.name ?? "Document"}</span>
        {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        <button
          type="button"
          aria-label="Close document details"
          onClick={onClose}
          className="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-md text-neutral hover:bg-muted hover:text-foreground"
        >
          <Icon name="x" small />
        </button>
      </div>
      <div className="card-b">
        {query.isLoading ? <Skeleton rows={4} /> : null}
        {query.isError ? (
          <Callout tone="warn" role="alert">
            {query.error && "message" in (query.error as object) ? (query.error as { message: string }).message : "We could not load this document."}
          </Callout>
        ) : null}
        {doc ? (
          <>
            <Facts
              items={[
                { label: "Type", value: doc.type || "Other" },
                { label: "Requested by", value: doc.requestedByName ?? "Your team" },
                { label: "Requested on", value: doc.requestedAt ? fmtAt(doc.requestedAt) : "—" },
                { label: "Current file", value: doc.file || "Nothing uploaded yet" },
              ]}
            />
            {doc.note ? <Callout tone="info">{doc.note}</Callout> : null}
            {doc.reason && (doc.status === "rejected" || doc.status === "info") ? (
              <Callout tone="warn">
                <strong>Reviewer note:</strong> <span>{doc.reason}</span>
              </Callout>
            ) : null}
            {needsUpload(doc) ? (
              <div className="stack-8 rounded-[10px] border border-dashed border-border-strong bg-background p-3">
                <span className="flabel">Upload a file</span>
                <span className="help">PDF, PNG, JPG or DOCX, up to {MAX_FILE_MB} MB.</span>
                <div className="flex flex-wrap gap-2">
                  <FileButton ariaLabel={`Choose a file for ${doc.name}`} accept={FILE_ACCEPT} icon="upload" onFile={(f) => onFile(doc, f)}>
                    {busy ? "Uploading…" : "Choose file"}
                  </FileButton>
                </div>
              </div>
            ) : null}
            {canDownload(doc) ? (
              <Button size="sm" className="self-start" onClick={() => onDownload(doc.id)}>
                <Icon name="download" small />
                Download
              </Button>
            ) : null}
            <span className="flabel">History</span>
            <Timeline
              items={history.map((h, i) => {
                const note = h.status === "submitted" ? "" : h.note;
                return {
                  id: `${h.at}-${i}`,
                  dotClass: "bg-primary/40",
                  content: (
                    <>
                      <Badge tone={DOC_STATUS[h.status].tone} compact>
                        {DOC_STATUS[h.status].label}
                      </Badge>{" "}
                      <span className="help">{fmtAt(h.at)}</span>
                      {note ? <div className="mini">{note}</div> : null}
                    </>
                  ),
                };
              })}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
