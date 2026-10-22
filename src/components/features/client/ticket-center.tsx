"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { isClientVisibleEvent, roleLabelOf } from "@/components/features/client/client-shared";
import { MessageBubble } from "@/components/common/message-bubble";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Callout, Card, Chip, EmptyState, PageHeader } from "@/components/ui/primitives";
import { TICKET_CATEGORIES, TICKET_TONE } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { cn } from "@/lib/cn";
import { clientTicketAction, createTicket } from "@/store/actions/comms";
import { projectOfClient, userName } from "@/store/selectors";
import type { Ticket } from "@/types/domain";

type Filter = "active" | "resolved" | "all";
const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "active", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const ticketSchema = z.object({
  title: z.string().trim().min(1, "Enter a subject."),
  category: z.string().min(1),
  priority: z.enum(["Normal", "High"]),
  desc: z.string().trim().min(1, "Describe the issue."),
  related: z.enum(["case", "none"]),
});
type TicketValues = z.infer<typeof ticketSchema>;

function NewTicketForm({ hasCase, onCancel, onCreated }: { hasCase: boolean; onCancel: () => void; onCreated: (id: string) => void }) {
  const dispatch = useAppDispatch();
  const me = useMe();
  const data = useData();
  const project = projectOfClient(data, me.id);
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<TicketValues>({
    resolver: zodResolver(ticketSchema),
    mode: "onChange",
    defaultValues: { title: "", category: TICKET_CATEGORIES[0], priority: "Normal", desc: "", related: hasCase ? "case" : "none" },
  });

  const submit = handleSubmit((values) => {
    const res = dispatch(createTicket(values));
    if (res.ok && res.id !== undefined) onCreated(String(res.id));
    else setFormError(res.error ?? "Could not create the ticket.");
  });

  return (
    <form onSubmit={submit} noValidate aria-labelledby="ntf-h" className="card flex flex-col gap-2.5 p-4">
      <span id="ntf-h" className="h3">
        New ticket
      </span>
      <FieldRow>
        <Field label="Subject" error={errors.title?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={Boolean(errors.title)} {...register("title")} />}
        </Field>
        <Field label="Category">
          {(id) => (
            <Select id={id} {...register("category")}>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Priority" className="!flex-[0_1_140px]">
          {(id) => (
            <Select id={id} {...register("priority")}>
              <option>Normal</option>
              <option>High</option>
            </Select>
          )}
        </Field>
      </FieldRow>
      <Field label="Describe the issue" error={errors.desc?.message}>
        {(id, d) => <Textarea id={id} aria-describedby={d} invalid={Boolean(errors.desc)} {...register("desc")} />}
      </Field>
      <Field label="Related case" className="max-w-[360px]">
        {(id) => (
          <Select id={id} {...register("related")}>
            {project ? <option value="case">{`${me.caseId} · ${project.id}`}</option> : null}
            <option value="none">{project ? "Not about my case" : "Not about a case"}</option>
          </Select>
        )}
      </Field>
      {formError ? (
        <span role="alert" className="errtxt">
          {formError}
        </span>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
          Submit ticket
        </Button>
      </div>
    </form>
  );
}

function TicketDetail({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useData();
  const me = useMe();
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  const thread = ticket.thread.filter((m) => !m.internal);
  const events = ticket.events.filter(isClientVisibleEvent);
  const finished = ticket.status === "Resolved" || ticket.status === "Closed";
  const resolvedLine = ticket.resolution
    ? ` · Resolved by ${userName(data, ticket.resolution.by)} — ${roleLabelOf(data, ticket.resolution.by)} — ${ticket.resolution.time}`
    : "";

  const send = () => {
    const res = dispatch(clientTicketAction(ticket.id, "reply", reply));
    if (res.ok) {
      setReply("");
      setError("");
    } else setError(res.error ?? "");
  };

  return (
    <Card aria-label={`Ticket ${ticket.id}`}>
      <div className="card-h">
        <span className="mono help">{ticket.id}</span>
        <span className="h3">{ticket.title}</span>
        <Badge tone={TICKET_TONE[ticket.status]}>{ticket.status}</Badge>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Close ticket"
          onClick={onClose}
          className="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-md text-neutral hover:bg-muted hover:text-foreground"
        >
          <Icon name="x" small />
        </button>
      </div>
      <div className="card-b">
        <span className="help">
          {ticket.category} · Created {ticket.created}
          {resolvedLine}
        </span>
        <p className="text-sm">{ticket.desc}</p>
        {ticket.resolution && finished ? (
          <Callout tone="ok">
            <strong>Resolution:</strong> <span>{ticket.resolution.note}</span>
          </Callout>
        ) : null}
        {thread.map((m, i) => {
          const sender = data.users.find((u) => u.id === m.from);
          return (
            <MessageBubble
              key={`${m.time}-${i}`}
              text={m.text}
              who={sender?.name ?? "Unknown"}
              role={sender ? roleLabelOf(data, sender.id) : ""}
              time={m.time}
              mine={m.from === me.id}
              senderRole={sender?.role}
            />
          );
        })}
        {ticket.status !== "Closed" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <Textarea
                className="min-h-10"
                aria-label="Add a reply to your ticket"
                placeholder="Add more information…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <Button variant="primary" disabled={!reply.trim()} onClick={send}>
                Send
              </Button>
            </div>
            {error ? (
              <span role="alert" className="errtxt">
                {error}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="help">This ticket is closed. Open a new ticket if the problem comes back.</p>
        )}
        {ticket.status === "Resolved" ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ok" onClick={() => dispatch(clientTicketAction(ticket.id, "confirm"))}>
              Confirm it&apos;s resolved
            </Button>
            <Button size="sm" onClick={() => dispatch(clientTicketAction(ticket.id, "reopen"))}>
              Request reopening
            </Button>
          </div>
        ) : null}
        <span className="flabel">History</span>
        <div className="flex flex-col gap-2">
          {events.map((e, i) => (
            <div key={`${e.time}-${i}`} className="flex gap-2.5 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-[5px] size-[9px] flex-none rounded-full",
                  e.to === "Resolved" ? "bg-success" : e.to === "Closed" ? "bg-muted-foreground" : "bg-primary",
                )}
              />
              <span>
                {e.from ? `${e.from} → ${e.to}` : e.to} · {userName(data, e.by)} — {roleLabelOf(data, e.by)} — {e.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** The ticket center sub-view of Home: raise a ticket, filter, and follow every reply. */
export function TicketCenter({ nav }: { nav: WorkspaceNav }) {
  const data = useData();
  const me = useMe();
  const [filter, setFilter] = useState<Filter>("active");
  const [showForm, setShowForm] = useState(nav.param("form") === "1");
  const [created, setCreated] = useState("");

  const mine = data.tickets.filter((t) => t.client === me.id);
  const hasCase = Boolean(projectOfClient(data, me.id));
  const visible = mine.filter((t) => {
    if (filter === "all") return true;
    const fin = t.status === "Resolved" || t.status === "Closed";
    return filter === "resolved" ? fin : !fin;
  });
  const openId = nav.param("ticket");
  const openTicket = mine.find((t) => t.id === openId);

  const openForm = () => {
    setShowForm(true);
    setCreated("");
    nav.setParams({ ticket: undefined, form: undefined });
  };

  return (
    <div className="stack-16">
      <div>
        <Button variant="ghost" size="sm" className="pl-0.5" onClick={() => nav.go("home")}>
          <Icon name="chevL" small />
          Back to Home
        </Button>
      </div>
      <PageHeader
        title="Ticket center"
        description="Raise a problem with your formation or the portal and follow every reply."
        actions={
          <Button variant="primary" onClick={openForm}>
            <Icon name="plus" small />
            New ticket
          </Button>
        }
      />
      {showForm ? (
        <NewTicketForm
          hasCase={hasCase}
          onCancel={() => setShowForm(false)}
          onCreated={(id) => {
            setShowForm(false);
            setCreated(id);
            setFilter("active");
          }}
        />
      ) : null}
      {created ? (
        <Callout tone="ok" icon="check" role="status">
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              Ticket <strong className="mono">{created}</strong> created with status <strong>Open</strong>. Your team has an in-app notification.
            </span>
            <Button
              size="sm"
              onClick={() => {
                setCreated("");
                nav.setParams({ ticket: created });
              }}
            >
              View ticket
            </Button>
          </span>
        </Callout>
      ) : null}
      <Card>
        <div className="card-h">
          <div role="group" aria-label="Ticket filter" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label}
              </Chip>
            ))}
          </div>
        </div>
        {visible.map((t) => (
          <div key={t.id} className="row">
            <span className="mono help">{t.id}</span>
            <span className="min-w-[180px] flex-1 font-medium">{t.title}</span>
            <Badge tone={TICKET_TONE[t.status]}>{t.status}</Badge>
            <span className="help">{t.updated}</span>
            <Button
              size="sm"
              onClick={() => {
                setShowForm(false);
                setCreated("");
                nav.setParams({ ticket: t.id, form: undefined });
              }}
            >
              View
            </Button>
          </div>
        ))}
        {visible.length === 0 ? (
          <EmptyState
            title="No tickets"
            text={mine.length ? "No tickets in this view." : "You haven't raised any tickets. Use New ticket if something isn't right."}
          />
        ) : null}
      </Card>
      {openTicket ? <TicketDetail key={openTicket.id} ticket={openTicket} onClose={() => nav.setParams({ ticket: undefined })} /> : null}
    </div>
  );
}
