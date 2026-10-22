"use client";

import { useState } from "react";

import { FILE_ACCEPT, FileButton } from "@/components/features/client/client-shared";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Callout, Card, Chip, Count, EmptyState, Facts, PageHeader, Timeline } from "@/components/ui/primitives";
import { DOC_STATUS, ROLE_LABEL } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { cn } from "@/lib/cn";
import { fmtAt } from "@/lib/dates";
import { clientUpload, openFile, validateFile } from "@/store/actions/comms";
import { userById, userName } from "@/store/selectors";
import type { ClientDoc, DocStatus } from "@/types/domain";

type Tab = "all" | DocStatus;
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

/** Client Documents: requests, validated uploads, reviewer notes and history. */
export function ClientDocumentsView({ nav }: ViewProps) {
  const dispatch = useAppDispatch();
  const data = useData();
  const me = useMe();
  const [tab, setTab] = useState<Tab>("all");
  const [uploadErr, setUploadErr] = useState("");

  const docs = data.docs.filter((d) => d.client === me.id);
  const rows = tab === "all" ? docs : docs.filter((d) => d.status === tab);
  const pending = docs.filter(needsUpload).length;
  const openDoc = docs.find((d) => String(d.id) === nav.param("doc"));

  const select = (id: number) => {
    setUploadErr("");
    nav.setParams({ doc: String(id) });
  };
  const upload = (doc: ClientDoc, file: File | null) => {
    const err = validateFile(file);
    if (err || !file) {
      setUploadErr(err);
      nav.setParams({ doc: String(doc.id) });
      return;
    }
    const res = dispatch(clientUpload(doc.id, file.name));
    setUploadErr(res.ok ? "" : (res.error ?? ""));
  };
  const sample = (doc: ClientDoc) => {
    const res = dispatch(clientUpload(doc.id, `${doc.name} (sample).pdf`));
    setUploadErr(res.ok ? "" : (res.error ?? ""));
  };

  return (
    <div className="stack-16">
      <PageHeader
        title="Documents"
        description={`Only you and authorized ${data.company.name} reviewers can see these files. In this prototype uploads are simulated: only the file name is kept, nothing is stored.`}
        actions={pending ? <Badge tone="warn" className="h-7">{pending} waiting on you</Badge> : null}
      />
      <div role="group" aria-label="Document status" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Chip key={t.value} active={tab === t.value} onClick={() => setTab(t.value)}>
            {t.label}
            <Count>{t.value === "all" ? docs.length : docs.filter((d) => d.status === t.value).length}</Count>
          </Chip>
        ))}
      </div>
      {uploadErr ? (
        <Callout tone="warn" icon="alert" role="alert">
          {uploadErr}
        </Callout>
      ) : null}
      <div className="grid2">
        <Card>
          {rows.map((d) => {
            const status = DOC_STATUS[d.status];
            return (
              <div key={d.id} className={cn("row items-start", openDoc?.id === d.id && "bg-primary-soft")}>
                <div className="flex min-w-[220px] flex-1 flex-col gap-[3px]">
                  <button type="button" className="linkb font-medium" aria-current={openDoc?.id === d.id || undefined} onClick={() => select(d.id)}>
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
                  <>
                    <FileButton ariaLabel={`Upload ${d.name}`} accept={FILE_ACCEPT} onFile={(f) => upload(d, f)}>
                      Upload
                    </FileButton>
                    <Button size="sm" onClick={() => sample(d)}>
                      Use sample file
                    </Button>
                  </>
                ) : null}
                {canDownload(d) ? (
                  <Button size="sm" variant="ghost" onClick={() => dispatch(openFile(d.id, "Download"))}>
                    Download
                  </Button>
                ) : null}
              </div>
            );
          })}
          {rows.length === 0 ? (
            <EmptyState
              title="Nothing here"
              text={docs.length ? "No documents in this view." : "No documents yet. Requests from your team will appear here."}
            />
          ) : null}
        </Card>

        <Card aria-label="Document details" className={cn(!openDoc && "max-[860px]:hidden")}>
          {openDoc ? (
            <DocDetail
              doc={openDoc}
              onClose={() => {
                setUploadErr("");
                nav.setParams({ doc: undefined });
              }}
              onFile={(f) => upload(openDoc, f)}
              onSample={() => sample(openDoc)}
              onDownload={() => dispatch(openFile(openDoc.id, "Download"))}
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
  doc: ClientDoc;
  onClose: () => void;
  onFile: (file: File | null) => void;
  onSample: () => void;
  onDownload: () => void;
}

function DocDetail({ doc, onClose, onFile, onSample, onDownload }: DocDetailProps) {
  const data = useData();
  const me = useMe();
  const status = DOC_STATUS[doc.status];
  const history = doc.history.slice().reverse();

  return (
    <>
      <div className="card-h">
        <span className="h3 flex-1">{doc.name}</span>
        <Badge tone={status.tone}>{status.label}</Badge>
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
        <Facts
          items={[
            { label: "Type", value: doc.type || "Other" },
            { label: "Requested by", value: doc.requestedBy ? userName(data, doc.requestedBy) : "Your team" },
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
            <span className="help">PDF, PNG, JPG or DOCX, up to 25 MB.</span>
            <div className="flex flex-wrap gap-2">
              <FileButton ariaLabel={`Choose a file for ${doc.name}`} accept={FILE_ACCEPT} icon="upload" onFile={onFile}>
                Choose file
              </FileButton>
              <Button size="sm" onClick={onSample}>
                Use sample file
              </Button>
            </div>
          </div>
        ) : null}
        {canDownload(doc) ? (
          <Button size="sm" className="self-start" onClick={onDownload}>
            <Icon name="download" small />
            Download
          </Button>
        ) : null}
        <span className="flabel">History</span>
        <Timeline
          items={history.map((h, i) => {
            const u = userById(data, h.by);
            const note = h.status === "submitted" ? "" : h.note;
            return {
              id: `${h.at}-${i}`,
              dotClass: "bg-primary/40",
              content: (
                <>
                  <Badge tone={DOC_STATUS[h.status].tone} compact>
                    {DOC_STATUS[h.status].label}
                  </Badge>{" "}
                  <span className="help">
                    {u ? (u.id === me.id ? "You" : `${u.name} · ${ROLE_LABEL[u.role]}`) : "—"} · {fmtAt(h.at)}
                  </span>
                  {note ? <div className="mini">{note}</div> : null}
                </>
              ),
            };
          })}
        />
      </div>
    </>
  );
}
