"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { DOC_STATUS } from "@/constants/vocab";
import { useDocumentDownload } from "@/hooks/useDocumentFile";
import { useDebounced } from "@/hooks/useDebounced";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { useDeleteDocumentMutation, useDocumentsQuery } from "@/store/api/documents";
import type { ClientDoc } from "@/types/domain";

const PAGE_SIZE = 10;

interface DocumentListProps {
  /** Only requests waiting on the client and corrections. */
  outstandingOnly: boolean;
  /** A document opened by a deep link: highlighted. */
  focusId: string;
}

export function DocumentList({ outstandingOnly, focusId }: DocumentListProps) {
  const me = useMe();
  const run = useAction();
  const { download, busyId } = useDocumentDownload();
  const [deleteDoc] = useDeleteDocumentMutation();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim(), 300);
  const result = useDocumentsQuery({ group: outstandingOnly ? "outstanding" : undefined, search, page, limit: PAGE_SIZE });
  const docs: ClientDoc[] = result.data?.items ?? [];
  const meta = result.data?.meta;
  const canFiles = can(me, "docsAccess");
  const canDelete = can(me, "deleteDocument");

  const remove = (d: ClientDoc) => {
    if (!window.confirm(`Delete "${d.name}"? The record and file are kept, but it disappears from lists.`)) return;
    void run(deleteDoc(d.id), { success: "Document deleted. The record is kept." });
  };

  return (
    <section className="card overflow-hidden">
      <div className="card-h">
        <span className="h3 flex-1">{outstandingOnly ? "Outstanding requests and corrections" : "All client documents"}</span>
        <Input
          type="search"
          aria-label="Search documents"
          placeholder="Search document or client"
          className="w-[240px]"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <QueryState
        query={result}
        isEmpty={docs.length === 0}
        empty={{ title: outstandingOnly ? "Nothing outstanding" : "No documents", text: outstandingOnly ? "Requests waiting on clients appear here." : "Documents requested from or shared with clients appear here." }}
      >
        {docs.map((d) => {
          const status = DOC_STATUS[d.status];
          return (
            <div key={d.id} id={`doc-${d.id}`} className={cn("row", d.id === focusId && "bg-primary-soft")}>
              <div className="flex-[1_1_220px]">
                <div className="font-medium">{d.name}</div>
                <div className="help">
                  {d.clientName} · <span className="mono">{d.clientCaseId}</span>
                  {d.file ? ` · ${d.file}` : ""}
                </div>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
              {canFiles && d.file ? (
                <Button size="sm" variant="ghost" disabled={busyId === d.id} onClick={() => void download(d.id)}>
                  {busyId === d.id ? "Downloading…" : "Download"}
                </Button>
              ) : null}
              {canDelete ? (
                <Button size="sm" variant="ghost" onClick={() => remove(d)}>
                  Delete
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
    </section>
  );
}
