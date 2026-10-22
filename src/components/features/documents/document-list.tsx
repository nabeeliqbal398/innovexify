"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { DOC_STATUS } from "@/constants/vocab";
import { cn } from "@/lib/cn";
import { useAppDispatch, useData } from "@/hooks/useStore";
import { openFile } from "@/store/actions/comms";
import { userById } from "@/store/selectors";

interface DocumentListProps {
  /** Only requests waiting on the client and corrections. */
  outstandingOnly: boolean;
  focusId: number;
}

export function DocumentList({ outstandingOnly, focusId }: DocumentListProps) {
  const dispatch = useAppDispatch();
  const data = useData();
  const docs = data.docs.filter((d) => !outstandingOnly || d.status === "requested" || d.status === "rejected");

  return (
    <section className="card overflow-hidden">
      <div className="card-h">
        <span className="h3">{outstandingOnly ? "Outstanding requests and corrections" : "All client documents"}</span>
      </div>
      {docs.map((d) => {
        const client = userById(data, d.client);
        const status = DOC_STATUS[d.status];
        return (
          <div key={d.id} id={`doc-${d.id}`} className={cn("row", d.id === focusId && "bg-primary-soft")}>
            <div className="flex-[1_1_220px]">
              <div className="font-medium">{d.name}</div>
              <div className="help">
                {client?.name} · <span className="mono">{client?.caseId}</span>
                {d.file ? ` · ${d.file}` : ""}
              </div>
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
            {d.file ? (
              <Button size="sm" variant="ghost" onClick={() => dispatch(openFile(d.id, "Download"))}>
                Download
              </Button>
            ) : null}
          </div>
        );
      })}
      {docs.length === 0 ? <EmptyState title="Nothing outstanding" text="Requests waiting on clients appear here." /> : null}
    </section>
  );
}
