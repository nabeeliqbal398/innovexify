"use client";

import { useState } from "react";

import { MessageBubble } from "@/components/common/message-bubble";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/form";
import { PRIORITY_TONE, ROLE_LABEL } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { fmtAt } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { acknowledgeReport, addReportNote, replyReport, setReportStatus } from "@/store/actions/comms";
import { userById, userName } from "@/store/selectors";
import type { Report } from "@/types/domain";

import { reportLabel, REPORT_TONE } from "./report-status";

/** Header, thread and actions for one report. Mount it with a key so drafts reset per report. */
export function ReportDetail({ report }: { report: Report }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [replyError, setReplyError] = useState("");
  const [noteError, setNoteError] = useState("");

  const client = userById(data, report.client);
  const canReview = can(me, "reportReview");
  const canAck = can(me, "reportAck") && report.status === "Submitted";

  const sendReply = () => {
    const result = dispatch(replyReport(report.id, reply));
    if (result.ok) setReply("");
    setReplyError(result.error ?? "");
  };
  const saveNote = () => {
    const result = dispatch(addReportNote(report.id, note));
    if (result.ok) setNote("");
    setNoteError(result.error ?? "");
  };

  return (
    <>
      <div className="flex flex-col gap-1.5 border-b border-border px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h3">{report.title}</span>
          <Badge tone={REPORT_TONE[report.status]}>{reportLabel(report.status)}</Badge>
          <Badge tone={PRIORITY_TONE[report.priority] ?? "q"}>{report.priority || "Normal"}</Badge>
          <Badge tone="q">{report.category || "Other"}</Badge>
        </div>
        <span className="help">
          {report.id} · {client?.name ?? "—"} ·{" "}
          <span className="mono">
            {client?.caseId} · {report.project || "—"}
          </span>{" "}
          · from {userName(data, report.csr)} (CSR) · {report.created}
        </span>
        <p className="whitespace-pre-wrap text-sm">{report.body}</p>
        <div className="flex gap-1.5 rounded-md bg-background px-2.5 py-1.5 text-sm">
          <strong>Requested action:</strong> <span>{report.action || "No specific action requested"}</span>
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-neutral">
          {report.history.map((h) => {
            const by = userById(data, h.by);
            return (
              <span key={`${h.status}-${h.at}`}>
                <strong>{reportLabel(h.status)}</strong> · {by?.name ?? "?"} ({by ? ROLE_LABEL[by.role] : ""}) · {fmtAt(h.at)}
              </span>
            );
          })}
        </div>
      </div>
      <div className="thread">
        {report.thread.map((m, i) => {
          const sender = userById(data, m.from);
          return (
            <MessageBubble
              key={`${m.time}-${i}`}
              text={m.text}
              who={sender?.name ?? "Unknown"}
              role={sender ? ROLE_LABEL[sender.role] : ""}
              time={m.time}
              mine={m.from === me.id}
              senderRole={sender?.role}
            />
          );
        })}
        {report.thread.length === 0 ? <span className="help m-auto">No responses yet.</span> : null}
      </div>
      <div className="flex flex-col gap-2 border-t border-muted p-2.5">
        <div className="flex gap-2">
          <Textarea
            className="min-h-[42px]"
            aria-label="Reply to report"
            placeholder="Reply…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <Button variant="primary" onClick={sendReply} disabled={!reply.trim()}>
            Reply
          </Button>
        </div>
        {replyError ? (
          <span role="alert" className="errtxt">
            {replyError}
          </span>
        ) : null}
        {canReview ? (
          <>
            <div className="flex flex-wrap gap-2">
              {canAck ? (
                <Button size="sm" onClick={() => dispatch(acknowledgeReport(report.id))}>
                  Acknowledge
                </Button>
              ) : null}
              <Button size="sm" onClick={() => dispatch(setReportStatus(report.id, "Clarification requested"))}>
                Request clarification
              </Button>
              <Button size="sm" variant="ok" onClick={() => dispatch(setReportStatus(report.id, "Reviewed"))}>
                Mark resolved
              </Button>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-[#FCD34D] bg-warning-soft px-[11px] py-[9px] text-sm text-[#78350F] dark:border-warning/40 dark:text-warning">
              <strong className="flex items-center gap-1.5">
                <Icon name="lock" small />
                Compliance notes (not shown to the CSR or client)
              </strong>
              {report.notes.map((n, i) => (
                <span key={`${n.time}-${i}`}>
                  {n.text} <span className="help">· {userName(data, n.from)}, {n.time}</span>
                </span>
              ))}
              <div className="flex w-full gap-1.5">
                <Input aria-label="New compliance note" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" onClick={saveNote} disabled={!note.trim()}>
                  Save
                </Button>
              </div>
              {noteError ? (
                <span role="alert" className="errtxt">
                  {noteError}
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
