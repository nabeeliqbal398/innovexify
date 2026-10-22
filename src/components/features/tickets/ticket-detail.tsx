"use client";

import { useState } from "react";

import { MessageBubble } from "@/components/common/message-bubble";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { Timeline } from "@/components/ui/primitives";
import { ROLE_LABEL, TICKET_STATUSES, TICKET_TONE } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { ticketAssignMe, ticketEscalate, ticketReply, ticketUpdate } from "@/store/actions/comms";
import { projectOfClient, userById } from "@/store/selectors";
import type { Ticket, TicketStatus } from "@/types/domain";

function eventDot(to: string): string {
  if (to === "Resolved") return "bg-success";
  if (to === "Closed") return "bg-muted-foreground";
  return "bg-primary";
}

/** Details, thread, reply box, status change and history for one ticket. Mount with a key per ticket. */
export function TicketDetail({ ticket }: { ticket: Ticket }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [note, setNote] = useState("");
  const [replyError, setReplyError] = useState("");
  const [updateError, setUpdateError] = useState("");

  const client = userById(data, ticket.client);
  const target = status || ticket.status;
  const needsResolution = target === "Resolved" && ticket.status !== "Resolved";
  const updateBlocked = target === ticket.status || (needsResolution && !note.trim());
  const handlerUser = userById(data, ticket.handler);
  const handler = handlerUser ? `${handlerUser.name} (${ROLE_LABEL[handlerUser.role]})` : "Unassigned";
  const resolver = ticket.resolution ? userById(data, ticket.resolution.by) : undefined;

  const sendReply = () => {
    const result = dispatch(ticketReply(ticket.id, reply, internal));
    if (result.ok) setReply("");
    setReplyError(result.error ?? "");
  };
  const update = () => {
    const result = dispatch(ticketUpdate(ticket.id, target, note));
    if (result.ok) {
      setStatus("");
      setNote("");
    }
    setUpdateError(result.error ?? "");
  };

  return (
    <>
      <div className="flex flex-col gap-1.5 border-b border-border p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono help">{ticket.id}</span>
          <span className="h3">{ticket.title}</span>
          <Badge tone={TICKET_TONE[ticket.status]}>{ticket.status}</Badge>
          <Badge tone={ticket.priority === "High" ? "err" : "q"}>{ticket.priority}</Badge>
          {ticket.escalated ? <Badge tone="err">Escalated</Badge> : null}
        </div>
        <span className="help">
          {client?.name ?? "—"} · <span className="mono">{client?.caseId}</span> · {ticket.category} ·{" "}
          {ticket.project || projectOfClient(data, ticket.client)?.id || "No project"} · Created {ticket.created}
        </span>
        <span className="help">
          Handler: <strong className="text-foreground">{handler}</strong>
          {ticket.resolution ? ` · Resolved by ${resolver?.name ?? "—"} — ${resolver ? ROLE_LABEL[resolver.role] : ""} — ${ticket.resolution.time}` : ""}
        </span>
        <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.desc}</p>
      </div>
      <div className="thread max-h-[260px]">
        {ticket.thread.length === 0 ? <p className="help text-center">No replies yet.</p> : null}
        {ticket.thread.map((m, i) => {
          const sender = userById(data, m.from);
          return (
            <div key={`${m.time}-${i}`} className={m.internal && m.from === me.id ? "[&>div]:items-end" : undefined}>
              <MessageBubble
                text={m.internal ? `Internal note · ${m.text}` : m.text}
                who={sender?.name ?? "Unknown"}
                role={sender ? ROLE_LABEL[sender.role] : ""}
                time={m.time}
                mine={m.from === me.id && !m.internal}
                senderRole={sender?.role}
                internal={m.internal}
              />
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-2.5 border-t border-muted px-3.5 py-3">
        <div className="flex gap-2">
          <Textarea
            className="min-h-[42px]"
            aria-label="Reply on ticket"
            placeholder="Reply to the client, or add an internal note"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <Button variant="primary" onClick={sendReply} disabled={!reply.trim()}>
            Send
          </Button>
        </div>
        {replyError ? (
          <span role="alert" className="errtxt">
            {replyError}
          </span>
        ) : null}
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-warning" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          Internal note (hidden from the client)
        </label>
        <FieldRow>
          <Field label="Change status">
            {(id) => (
              <Select id={id} value={target} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                {TICKET_STATUSES.map((s) => (
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
          <Button variant="primary" className="!flex-none" onClick={update} disabled={updateBlocked}>
            Update
          </Button>
          {ticket.handler !== me.id ? (
            <Button className="!flex-none" onClick={() => dispatch(ticketAssignMe(ticket.id))}>
              Assign to me
            </Button>
          ) : null}
          <Button className="!flex-none" onClick={() => dispatch(ticketEscalate(ticket.id))}>
            {ticket.escalated ? "Remove escalation" : "Escalate"}
          </Button>
        </FieldRow>
        <div className="flex flex-col gap-1.5">
          <span className="flabel">Status history</span>
          <Timeline
            items={ticket.events.map((e, i) => {
              const by = userById(data, e.by);
              return {
                id: `${e.time}-${i}`,
                dotClass: eventDot(e.to),
                content: (
                  <span className="text-sm">
                    <strong>{e.from ? `${e.from} → ${e.to}` : e.to}</strong> · {by?.name ?? "?"} — {by ? ROLE_LABEL[by.role] : ""} — {e.time}
                    {e.note ? <span className="help block">{e.note}</span> : null}
                  </span>
                ),
              };
            })}
          />
        </div>
      </div>
    </>
  );
}
