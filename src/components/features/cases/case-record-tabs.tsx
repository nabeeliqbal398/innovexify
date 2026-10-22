"use client";

import { useState } from "react";

import { MessageBubble } from "@/components/common/message-bubble";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Card, EmptyState } from "@/components/ui/primitives";
import { DOC_STATUS, FILING_TONE, ROLE_LABEL } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { ago, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { openFilingEditor } from "@/store/actions/cases";
import { openConversation, openFile } from "@/store/actions/comms";
import { userById, userName } from "@/store/selectors";
import type { Project, User } from "@/types/domain";
import { CaseFilingDialog } from "./case-filing-dialog";
import { DocumentPreviewDialog } from "./document-preview-dialog";

interface TabProps {
  project: Project;
  client: User;
  nav: WorkspaceNav;
}

export function DocumentsTab({ client, nav }: TabProps) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [preview, setPreview] = useState<number | null>(null);
  const canFiles = can(me, "docsAccess", { client: client.id });
  const docs = data.docs.filter((d) => d.client === client.id);

  return (
    <Card>
      {!canFiles ? (
        <div className="px-3.5 pt-3">
          <Callout tone="lock" icon="lock">
            Status only. Your role can&apos;t open, preview or download client files.
          </Callout>
        </div>
      ) : null}
      {docs.map((d) => {
        const last = d.history.slice(-1)[0];
        const meta = last ? `Updated ${ago(last.at)}${canFiles && last.by ? ` by ${userName(data, last.by)}` : ""}` : "";
        return (
          <div key={d.id} className="row">
            <div className="min-w-0 flex-[1_1_220px]">
              <div className="font-medium">{d.name}</div>
              <div className="help">
                {d.type || "Other"} · {meta}
              </div>
            </div>
            <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
            {canFiles && d.file ? (
              <Button size="sm" onClick={() => dispatch(openFile(d.id, "Preview")) && setPreview(d.id)}>
                Preview
              </Button>
            ) : null}
          </div>
        );
      })}
      {docs.length === 0 ? <EmptyState title="No documents yet" /> : null}
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
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState<string | null>(null);
  const canFile = can(me, "filingTracker");
  const filings = data.filings.filter((f) => f.project === project.id);
  const edit = (id: string) => {
    if (dispatch(openFilingEditor())) setEditing(id);
  };

  return (
    <Card>
      <div className="px-3.5 pt-3">
        <Callout tone="info" icon="flag">
          Manual tracker. Nothing here is read from or sent to a state system.
        </Callout>
      </div>
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
            <Button size="sm" onClick={() => edit(f.id)}>
              Update
            </Button>
          ) : null}
        </div>
      ))}
      {filings.length === 0 ? <EmptyState title="No filings tracked" /> : null}
      {canFile ? (
        <div className="row">
          <Button size="sm" variant="primary" onClick={() => edit("")}>
            Add filing
          </Button>
        </div>
      ) : null}
      {editing !== null ? <CaseFilingDialog filingId={editing} projectId={project.id} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

export function MessagesTab({ client, nav }: TabProps) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const canChat = can(me, "conversation", client);
  const msgs = (data.msgs[client.id] ?? []).slice(-5);

  const openConv = () => {
    if (dispatch(openConversation(client.id))) nav.go("messages", { query: { c: client.id } });
  };

  return (
    <Card>
      <div className="thread">
        {msgs.map((m, i) => {
          const sender = userById(data, m.from);
          const attach = m.attach
            ? me.role === "CSR"
              ? " · Attachment withheld (CSRs can't open client files)"
              : ` · Attached: ${m.attach} (simulated, not stored)`
            : "";
          return (
            <MessageBubble
              key={`${m.at ?? i}-${i}`}
              text={m.text}
              who={sender?.name ?? "Unknown"}
              role={sender ? ROLE_LABEL[sender.role] : ""}
              time={m.time}
              mine={m.from === me.id}
              senderRole={sender?.role}
              suffix={attach}
            />
          );
        })}
        {msgs.length === 0 ? <span className="help m-auto">No messages yet.</span> : null}
      </div>
      {canChat ? (
        <div className="row">
          <span className="help flex-1">Showing the latest 5 messages from the shared client conversation.</span>
          <Button size="sm" variant="primary" onClick={openConv}>
            Open conversation
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
