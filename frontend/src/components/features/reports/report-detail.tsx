"use client";

import { useState } from "react";

import { MessageBubble } from "@/components/common/message-bubble";
import { ErrorState, Skeleton } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/form";
import { PRIORITY_TONE, ROLE_LABEL } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { fmtAt } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useAddReportNoteMutation, useReplyReportMutation, useReportQuery, useSetReportStatusMutation } from "@/store/api/reports";

import { reportLabel, REPORT_TONE } from "./report-status";

/** Header, thread and actions for one report. Mount it with a key so drafts reset per report. */
export function ReportDetail({ reportId }: { reportId: string }) {
  const me = useMe();
  const run = useAction();
  const query = useReportQuery(reportId);
  const [replyTo, replying] = useReplyReportMutation();
  const [addNote, noting] = useAddReportNoteMutation();
  const [setStatus, changing] = useSetReportStatusMutation();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [replyError, setReplyError] = useState("");
  const [noteError, setNoteError] = useState("");

  if (query.isLoading) return <Skeleton rows={6} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="We could not open this report" />;
  const report = query.data;

  const canReview = can(me, "reportReview");
  const canAck = can(me, "reportAck") && report.status === "Submitted";
  const inline = (setter: (m: string) => void) => (e: { message: string; errorCode: string; fieldErrors: Array<{ message: string }> }) => {
    if (e.errorCode === "PERMISSION_DENIED" || e.errorCode === "CONCURRENT_MODIFICATION") return;
    setter(e.fieldErrors[0]?.message ?? e.message);
  };

  const sendReply = async () => {
    const outcome = await run(replyTo({ id: report.id, text: reply.trim() }), { quiet: true });
    if (outcome.ok) {
      setReply("");
      setReplyError("");
    } else inline(setReplyError)(outcome.error);
  };
  const saveNote = async () => {
    const outcome = await run(addNote({ id: report.id, text: note.trim() }), { quiet: true });
    if (outcome.ok) {
      setNote("");
      setNoteError("");
    } else inline(setNoteError)(outcome.error);
  };
  const move = (status: "ACKNOWLEDGED" | "CLARIFICATION_REQUESTED" | "REVIEWED", success: string) => void run(setStatus({ id: report.id, status }), { success });

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
          {report.display} · {report.clientName ?? "—"} ·{" "}
          <span className="mono">
            {report.clientCaseId} · {report.project || "—"}
          </span>{" "}
          · from {report.csrName} (CSR) · {report.created}
        </span>
        <p className="whitespace-pre-wrap text-sm">{report.body}</p>
        <div className="flex gap-1.5 rounded-md bg-background px-2.5 py-1.5 text-sm">
          <strong>Requested action:</strong> <span>{report.action || "No specific action requested"}</span>
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-neutral">
          {report.history.map((h, i) => (
            <span key={`${h.status}-${h.at}-${i}`}>
              <strong>{reportLabel(h.status)}</strong> · {h.byName ?? "?"} · {fmtAt(h.at)}
            </span>
          ))}
        </div>
      </div>
      <div className="thread">
        {report.thread.map((m) => (
          <MessageBubble
            key={m.id ?? `${m.time}-${m.text}`}
            text={m.text}
            who={m.fromName ?? "Unknown"}
            role={m.fromRole ? ROLE_LABEL[m.fromRole] : ""}
            time={m.time}
            mine={m.from === me.id}
            senderRole={m.fromRole}
          />
        ))}
        {report.thread.length === 0 ? <span className="help m-auto">No responses yet.</span> : null}
      </div>
      <div className="flex flex-col gap-2 border-t border-muted p-2.5">
        <div className="flex gap-2">
          <Textarea className="min-h-[42px]" aria-label="Reply to report" placeholder="Reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
          <Button variant="primary" onClick={() => void sendReply()} disabled={!reply.trim() || replying.isLoading}>
            {replying.isLoading ? "Sending…" : "Reply"}
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
                <Button size="sm" disabled={changing.isLoading} onClick={() => move("ACKNOWLEDGED", `${report.display} acknowledged`)}>
                  Acknowledge
                </Button>
              ) : null}
              <Button size="sm" disabled={changing.isLoading} onClick={() => move("CLARIFICATION_REQUESTED", `${report.display}: clarification requested`)}>
                Request clarification
              </Button>
              <Button size="sm" variant="ok" disabled={changing.isLoading} onClick={() => move("REVIEWED", `${report.display} marked resolved`)}>
                Mark resolved
              </Button>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-[#FCD34D] bg-warning-soft px-[11px] py-[9px] text-sm text-[#78350F] dark:border-warning/40 dark:text-warning">
              <strong className="flex items-center gap-1.5">
                <Icon name="lock" small />
                Compliance notes (not shown to the CSR or client)
              </strong>
              {report.notes.map((n) => (
                <span key={n.id ?? `${n.time}-${n.text}`}>
                  {n.text}{" "}
                  <span className="help">
                    · {n.fromName}, {n.time}
                  </span>
                </span>
              ))}
              <div className="flex w-full gap-1.5">
                <Input aria-label="New compliance note" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" onClick={() => void saveNote()} disabled={!note.trim() || noting.isLoading}>
                  {noting.isLoading ? "Saving…" : "Save"}
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
