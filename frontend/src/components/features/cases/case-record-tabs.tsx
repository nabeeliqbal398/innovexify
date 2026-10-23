"use client";

import { useState } from "react";

import { MessageBubble } from "@/components/common/message-bubble";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Card } from "@/components/ui/primitives";
import { DOC_STATUS, FILING_TONE, ROLE_LABEL } from "@/constants/vocab";
import { useMe } from "@/hooks/useStore";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { ago, fmtAt, fmtDay } from "@/lib/dates";
import { ROLES } from "@/lib/api-mappers";
import { can } from "@/lib/permissions";
import { useCaseDocumentsQuery, useCaseFilingsQuery, useCaseMessagesQuery } from "@/store/api/cases";
import type { Project, User } from "@/types/domain";
import { CaseFilingDialog } from "./case-filing-dialog";
import { DocumentPreviewDialog } from "./document-preview-dialog";

interface TabProps {
  project: Project;
  client: User;
  nav: WorkspaceNav;
}

export function DocumentsTab({ client, nav }: TabProps) {
  const me = useMe();
  const [preview, setPreview] = useState<string | null>(null);
  const canFiles = can(me, "docsAccess", { client: client.id });
  const result = useCaseDocumentsQuery(client.id);
  const docs = result.data ?? [];

  return (
    <Card>
      {!canFiles ? (
        <div className="px-3.5 pt-3">
          <Callout tone="lock" icon="lock">
            Status only. Your role can&apos;t open, preview or download client files.
          </Callout>
        </div>
      ) : null}
      <QueryState query={result} isEmpty={docs.length === 0} empty={{ title: "No documents yet" }} rows={3}>
        {docs.map((d) => (
          <div key={d.id} className="row">
            <div className="min-w-0 flex-[1_1_220px]">
              <div className="font-medium">{d.name}</div>
              <div className="help">
                {d.type || "Other"} · Updated {ago(d.updatedAt)}
                {canFiles && d.updatedByName ? ` by ${d.updatedByName}` : ""}
              </div>
            </div>
            <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
            {canFiles && d.hasFile ? (
              <Button size="sm" onClick={() => setPreview(d.id)}>
                Preview
              </Button>
            ) : null}
          </div>
        ))}
      </QueryState>
      {can(me, "docsManage") ? (
        <div className="row">
          <Button size="sm" variant="primary" onClick={() => nav.go(me.role === "COMPLIANCE" ? "requests" : "documents", { query: { client: client.id } })}>
            Request a document
          </Button>
        </div>
      ) : null}
      <DocumentPreviewDialog docId={preview} onClose={() => setPreview(null)} />
    </Card>
  );
}

export function FilingsTab({ project }: TabProps) {
  const me = useMe();
  const [editing, setEditing] = useState<string | null>(null);
  const canFile = can(me, "filingTracker");
  const result = useCaseFilingsQuery(project.apiId, { skip: !canFile });
  const filings = result.data ?? [];

  return (
    <Card>
      <div className="px-3.5 pt-3">
        <Callout tone="info" icon="flag">
          Manual tracker. Nothing here is read from or sent to a state system.
        </Callout>
      </div>
      <QueryState query={result} isEmpty={filings.length === 0} empty={{ title: "No filings tracked" }} rows={2}>
        {filings.map((f) => (
          <div key={f.id} className="row">
            <div className="min-w-0 flex-[1_1_220px]">
              <div className="font-medium">{f.type}</div>
              <div className="help">
                Submitted {f.submitted ? fmtDay(f.submitted) : "Not submitted"} · Ref <span className="mono">{f.ref || "—"}</span> · Next:{" "}
                {f.next ? f.next + (f.nextDate ? ` · ${fmtDay(f.nextDate)}` : "") : "—"}
              </div>
            </div>
            <Badge tone={FILING_TONE[f.status]}>{f.status}</Badge>
            {canFile ? (
              <Button size="sm" onClick={() => setEditing(f.id)}>
                Update
              </Button>
            ) : null}
          </div>
        ))}
      </QueryState>
      {canFile ? (
        <div className="row">
          <Button size="sm" variant="primary" onClick={() => setEditing("")}>
            Add filing
          </Button>
        </div>
      ) : null}
      {editing !== null ? <CaseFilingDialog filing={filings.find((f) => f.id === editing)} project={project} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

export function MessagesTab({ client, nav }: TabProps) {
  const me = useMe();
  const canChat = can(me, "conversation", client);
  const result = useCaseMessagesQuery({ clientId: client.id, limit: 5 }, { skip: !canChat });
  const msgs = result.data ?? [];

  return (
    <Card>
      <QueryState query={result} isEmpty={msgs.length === 0} empty={{ title: "No messages yet" }} rows={2}>
        <div className="thread">
          {msgs.map((m) => {
            const role = ROLES.toLabel(m.fromRole);
            const attach = m.attachmentName ? (me.role === "CSR" ? " · Attachment withheld (CSRs can't open client files)" : ` · Attached: ${m.attachmentName}`) : "";
            return (
              <MessageBubble
                key={m.id}
                text={m.text}
                who={m.fromName}
                role={ROLE_LABEL[role]}
                time={fmtAt(m.at)}
                mine={m.mine}
                senderRole={role}
                suffix={attach}
              />
            );
          })}
        </div>
      </QueryState>
      {canChat ? (
        <div className="row">
          <span className="help flex-1">Showing the latest 5 messages from the shared client conversation.</span>
          <Button size="sm" variant="primary" onClick={() => nav.go("messages", { query: { c: client.id } })}>
            Open conversation
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
