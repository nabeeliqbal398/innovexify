"use client";

import { useState } from "react";

import { MessageBubble } from "@/components/common/message-bubble";
import { ErrorState, Skeleton } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { Timeline } from "@/components/ui/primitives";
import { ROLE_LABEL, TICKET_TONE } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { TICKET_STATUS } from "@/lib/api-mappers";
import {
  useAssignTicketMutation,
  useChangeTicketStatusMutation,
  useCloseTicketMutation,
  useEscalateTicketMutation,
  useReplyTicketMutation,
  useResolveTicketMutation,
  useTicketQuery,
} from "@/store/api/tickets";
import { useDirectoryQuery } from "@/store/api/people";
import type { Ticket, TicketStatus } from "@/types/domain";

function eventDot(to: string): string {
  if (to === "Resolved") return "bg-success";
  if (to === "Closed") return "bg-muted-foreground";
  return "bg-primary";
}

/** Loads one ticket by id (or TKT number) and shows its details, thread, reply box, status change and history. */
export function TicketDetail({ ticketId }: { ticketId: string }) {
  const query = useTicketQuery(ticketId);
  if (query.isLoading) return <Skeleton rows={6} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="We could not open this ticket" />;
  if (!query.data) return null;
  // Keyed by id and version so the status controls start from the ticket as it is now, but a reply being typed is kept.
  return <TicketPanel ticket={query.data} />;
}

function TicketPanel({ ticket }: { ticket: Ticket }) {
  const me = useMe();
  const run = useAction();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [note, setNote] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [handlerPick, setHandlerPick] = useState("");

  const [sendReply, replyState] = useReplyTicketMutation();
  const [changeStatus, statusState] = useChangeTicketStatusMutation();
  const [resolve, resolveState] = useResolveTicketMutation();
  const [close, closeState] = useCloseTicketMutation();
  const [assign, assignState] = useAssignTicketMutation();
  const [escalate, escalateState] = useEscalateTicketMutation();
  const canHandOver = me.role === "ADMIN" || me.role === "MANAGER";
  const staff = useDirectoryQuery(undefined, { skip: !canHandOver });

  // Only the moves the server will accept from here, plus where it is now.
  const options: TicketStatus[] = [ticket.status, ...ticket.allowedStatuses.filter((s) => s !== ticket.status)];
  const target = status && options.includes(status) ? status : ticket.status;
  const needsResolution = target === "Resolved" && ticket.status !== "Resolved";
  const finished = ticket.status === "Closed";
  const updateBusy = statusState.isLoading || resolveState.isLoading || closeState.isLoading;
  const updateBlocked = target === ticket.status || (needsResolution && !note.trim()) || updateBusy;

  const send = async () => {
    const outcome = await run(sendReply({ id: ticket.id, text: reply.trim(), internal }), { quiet: false });
    if (outcome.ok) setReply("");
  };

  const update = async () => {
    setUpdateError("");
    // The version is the ticket's as it is now (this panel re-renders with every refetch).
    const version = ticket.version;
    const outcome =
      target === "Resolved"
        ? await run(resolve({ id: ticket.id, version, resolutionNote: note.trim() }), { quiet: true, success: "Ticket resolved. The client can see the resolution note." })
        : target === "Closed"
          ? await run(close({ id: ticket.id, version }), { quiet: true, success: "Ticket closed." })
          : await run(changeStatus({ id: ticket.id, status: TICKET_STATUS.toKey(target), version, note: note.trim() || undefined }), { quiet: true, success: `Status changed to ${target}.` });
    if (outcome.ok) {
      setStatus("");
      setNote("");
    } else if (!["PERMISSION_DENIED", "CONCURRENT_MODIFICATION"].includes(outcome.error.errorCode)) {
      setUpdateError(outcome.error.fieldErrors[0]?.message ?? outcome.error.message);
    }
  };

  const takeIt = () => run(assign({ id: ticket.id, version: ticket.version }), { success: "Assigned to you." });
  const handOver = async () => {
    if (!handlerPick) return;
    const who = staff.data?.find((p) => p.id === handlerPick)?.name ?? "them";
    const outcome = await run(assign({ id: ticket.id, version: ticket.version, handlerId: handlerPick }), { success: `Assigned to ${who}.` });
    if (outcome.ok) setHandlerPick("");
  };
  const toggleEscalation = () =>
    run(escalate({ id: ticket.id, version: ticket.version, escalated: !ticket.escalated }), {
      success: ticket.escalated ? "Escalation removed." : "Escalated to Admin and Manager.",
    });

  const handler = ticket.handler ? ticket.handlerName : "Unassigned";
  const canEscalate = ticket.escalated || (ticket.status !== "Resolved" && ticket.status !== "Closed");

  return (
    <>
      <div className="flex flex-col gap-1.5 border-b border-border p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono help">{ticket.display}</span>
          <span className="h3">{ticket.title}</span>
          <Badge tone={TICKET_TONE[ticket.status]}>{ticket.status}</Badge>
          <Badge tone={ticket.priority === "High" || ticket.priority === "Urgent" ? "err" : "q"}>{ticket.priority}</Badge>
          {ticket.escalated ? <Badge tone="err">Escalated</Badge> : null}
        </div>
        <span className="help">
          {ticket.clientName} · <span className="mono">{ticket.clientCaseId}</span> · {ticket.category} · {ticket.project || "No project"} · Created {ticket.created}
        </span>
        <span className="help">
          Handler: <strong className="text-foreground">{handler}</strong>
          {ticket.resolution ? ` · Resolved by ${ticket.resolution.byName} — ${ticket.resolution.time}` : ""}
        </span>
        <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.desc}</p>
        {ticket.resolution?.note ? (
          <p className="text-sm">
            <strong>Resolution:</strong> {ticket.resolution.note}
          </p>
        ) : null}
      </div>
      <div className="thread max-h-[260px]">
        {ticket.thread.length === 0 ? <p className="help text-center">No replies yet.</p> : null}
        {ticket.thread.map((m) => (
          <div key={m.id} className={m.internal && m.from === me.id ? "[&>div]:items-end" : undefined}>
            <MessageBubble
              text={m.internal ? `Internal note · ${m.text}` : m.text}
              who={m.fromName}
              role={ROLE_LABEL[m.fromRole]}
              time={m.time}
              mine={m.from === me.id && !m.internal}
              senderRole={m.fromRole}
              internal={m.internal}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 border-t border-muted px-3.5 py-3">
        {finished ? (
          <p className="help">This ticket is closed, so it takes no more replies or changes.</p>
        ) : (
          <>
            <div className="flex gap-2">
              <Textarea
                className="min-h-[42px]"
                aria-label="Reply on ticket"
                placeholder="Reply to the client, or add an internal note"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <Button variant="primary" onClick={() => void send()} disabled={!reply.trim() || replyState.isLoading}>
                {replyState.isLoading ? "Sending…" : "Send"}
              </Button>
            </div>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="accent-warning" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              Internal note (hidden from the client)
            </label>
            <FieldRow>
              <Field label="Change status">
                {(id) => (
                  <Select id={id} value={target} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                    {options.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={needsResolution ? "Resolution notes (required)" : "Note (optional)"} error={updateError}>
                {(id, describedBy) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={Boolean(updateError)}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={target === "Resolved" ? "What fixed it" : "Why the status changed"}
                  />
                )}
              </Field>
              <Button variant="primary" className="!flex-none" onClick={() => void update()} disabled={updateBlocked}>
                {updateBusy ? "Updating…" : "Update"}
              </Button>
              {ticket.handler !== me.id ? (
                <Button className="!flex-none" disabled={assignState.isLoading} onClick={() => void takeIt()}>
                  Assign to me
                </Button>
              ) : null}
              <Button className="!flex-none" disabled={!canEscalate || escalateState.isLoading} onClick={() => void toggleEscalation()}>
                {ticket.escalated ? "Remove escalation" : "Escalate"}
              </Button>
            </FieldRow>
            {canHandOver ? (
              <FieldRow>
                <Field label="Hand over to">
                  {(id) => (
                    <Select id={id} value={handlerPick} onChange={(e) => setHandlerPick(e.target.value)}>
                      <option value="">Choose a staff member</option>
                      {(staff.data ?? [])
                        .filter((p) => p.id !== ticket.handler)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {ROLE_LABEL[p.role]}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
                <Button className="!flex-none" disabled={!handlerPick || assignState.isLoading} onClick={() => void handOver()}>
                  Hand over
                </Button>
              </FieldRow>
            ) : null}
          </>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="flabel">Status history</span>
          <Timeline
            items={ticket.events.map((e) => ({
              id: e.id,
              dotClass: eventDot(e.to),
              content: (
                <span className="text-sm">
                  <strong>{e.from && e.from !== e.to ? `${e.from} → ${e.to}` : e.to}</strong> · {e.byName} — {ROLE_LABEL[e.byRole]} — {e.time}
                  {e.note ? <span className="help block">{e.note}</span> : null}
                </span>
              ),
            }))}
          />
        </div>
      </div>
    </>
  );
}
