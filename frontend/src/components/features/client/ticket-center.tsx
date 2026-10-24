"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "@/lib/z";

import { MessageBubble } from "@/components/common/message-bubble";
import { Pager } from "@/components/common/pager";
import { ErrorState, QueryState, Skeleton } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Callout, Card, Chip, PageHeader } from "@/components/ui/primitives";
import { ROLE_LABEL, TICKET_CATEGORIES, TICKET_TONE } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { PRIORITY, TICKET_CATEGORY } from "@/lib/api-mappers";
import { cn } from "@/lib/cn";
import { useHomeCaseQuery } from "@/store/api/home";
import {
  useChangeTicketStatusMutation,
  useCloseTicketMutation,
  useCreateTicketMutation,
  useReplyTicketMutation,
  useTicketQuery,
  useTicketsQuery,
} from "@/store/api/tickets";
import type { Priority, Ticket } from "@/types/domain";

type Filter = "active" | "resolved" | "all";
const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "active", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];
const GROUP: Record<Filter, "active" | "finished" | undefined> = { active: "active", resolved: "finished", all: undefined };
const PAGE_SIZE = 10;

const ticketSchema = z.object({
  title: z.string().trim().min(1, "Enter a subject."),
  category: z.string().min(1),
  priority: z.enum(["Normal", "High"]),
  desc: z.string().trim().min(1, "Describe the issue."),
  related: z.enum(["case", "none"]),
});
type TicketValues = z.infer<typeof ticketSchema>;
const FIELD_OF: Record<string, keyof TicketValues> = { title: "title", description: "desc", category: "category", priority: "priority", caseId: "related" };

function NewTicketForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (ticket: Ticket) => void }) {
  const me = useMe();
  const run = useAction();
  const kase = useHomeCaseQuery();
  const [create, { isLoading }] = useCreateTicketMutation();
  const project = kase.data;
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<TicketValues>({
    resolver: zodResolver(ticketSchema),
    mode: "onChange",
    defaultValues: { title: "", category: TICKET_CATEGORIES[0], priority: "Normal", desc: "", related: "case" },
  });

  const submit = handleSubmit(async (values) => {
    setFormError("");
    const outcome = await run(
      create({
        title: values.title.trim(),
        description: values.desc.trim(),
        category: TICKET_CATEGORY.toKey(values.category),
        priority: PRIORITY.toKey(values.priority as Priority),
        caseId: values.related === "case" && project ? project.id : undefined,
      }),
      {
        quiet: true,
        setError: ((name: string, e: { message?: string }) => setError(FIELD_OF[name] ?? "title", { type: "server", message: e.message })) as never,
        fields: Object.keys(FIELD_OF),
      },
    );
    if (outcome.ok) onCreated(outcome.data);
    else if (outcome.error.fieldErrors.length === 0 && outcome.error.errorCode !== "PERMISSION_DENIED") setFormError(outcome.error.message);
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
        <Field label="Category" error={errors.category?.message}>
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
      <Field label="Related case" className="max-w-[360px]" error={errors.related?.message}>
        {(id) => (
          <Select id={id} {...register("related")}>
            {project ? <option value="case">{`${me.caseId} · ${project.display}`}</option> : null}
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
        <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
          {isLoading ? "Submitting…" : "Submit ticket"}
        </Button>
      </div>
    </form>
  );
}

function TicketPanel({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const me = useMe();
  const run = useAction();
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [send, sendState] = useReplyTicketMutation();
  const [setStatus, statusState] = useChangeTicketStatusMutation();
  const [close, closeState] = useCloseTicketMutation();

  const finished = ticket.status === "Resolved" || ticket.status === "Closed";
  const canConfirm = ticket.allowedStatuses.includes("Closed");
  const canReopen = ticket.allowedStatuses.includes("Open");
  const resolvedLine = ticket.resolution ? ` · Resolved by ${ticket.resolution.byName} — ${ticket.resolution.time}` : "";

  const sendReply = async () => {
    setError("");
    const outcome = await run(send({ id: ticket.id, text: reply.trim() }), { quiet: true });
    if (outcome.ok) setReply("");
    else if (outcome.error.errorCode !== "PERMISSION_DENIED") setError(outcome.error.message);
  };

  return (
    <Card aria-label={`Ticket ${ticket.display}`}>
      <div className="card-h">
        <span className="mono help">{ticket.display}</span>
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
        {ticket.thread.map((m) => (
          <MessageBubble key={m.id} text={m.text} who={m.fromName} role={ROLE_LABEL[m.fromRole]} time={m.time} mine={m.from === me.id} senderRole={m.fromRole} />
        ))}
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
              <Button variant="primary" disabled={!reply.trim() || sendState.isLoading} onClick={() => void sendReply()}>
                {sendState.isLoading ? "Sending…" : "Send"}
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
        {ticket.status === "Resolved" && (canConfirm || canReopen) ? (
          <div className="flex flex-wrap gap-2">
            {canConfirm ? (
              <Button
                size="sm"
                variant="ok"
                disabled={closeState.isLoading}
                onClick={() => void run(close({ id: ticket.id, version: ticket.version }), { success: "Thanks. The ticket is closed." })}
              >
                Confirm it&apos;s resolved
              </Button>
            ) : null}
            {canReopen ? (
              <Button
                size="sm"
                disabled={statusState.isLoading}
                onClick={() => void run(setStatus({ id: ticket.id, status: "OPEN", version: ticket.version }), { success: "Reopening requested. Your team was told." })}
              >
                Request reopening
              </Button>
            ) : (
              <span className="help self-center">It was resolved a while ago, so it can no longer be reopened from here. Open a new ticket if the problem is back.</span>
            )}
          </div>
        ) : null}
        <span className="flabel">History</span>
        <div className="flex flex-col gap-2">
          {ticket.events.map((e) => (
            <div key={e.id} className="flex gap-2.5 text-sm">
              <span
                aria-hidden="true"
                className={cn("mt-[5px] size-[9px] flex-none rounded-full", e.to === "Resolved" ? "bg-success" : e.to === "Closed" ? "bg-muted-foreground" : "bg-primary")}
              />
              <span>
                {e.from ? `${e.from} → ${e.to}` : e.to} · {e.byName} — {ROLE_LABEL[e.byRole]} — {e.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function OpenTicket({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useTicketQuery(id);
  if (query.isLoading) return <Skeleton rows={5} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="We could not open this ticket" />;
  return query.data ? <TicketPanel key={query.data.id} ticket={query.data} onClose={onClose} /> : null;
}

/** The ticket center sub-view of Home: raise a ticket, filter, and follow every reply. A ticket opens with `?ticket=<id>`. */
export function TicketCenter({ nav }: { nav: WorkspaceNav }) {
  const [filter, setFilter] = useState<Filter>("active");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(nav.param("form") === "1");
  const [created, setCreated] = useState<Ticket | null>(null);

  const list = useTicketsQuery({ group: GROUP[filter], page, limit: PAGE_SIZE });
  const rows = list.data?.items ?? [];
  const meta = list.data?.meta;
  const openId = nav.param("ticket");

  const openForm = () => {
    setShowForm(true);
    setCreated(null);
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
          onCancel={() => setShowForm(false)}
          onCreated={(t) => {
            setShowForm(false);
            setCreated(t);
            setFilter("active");
            setPage(1);
          }}
        />
      ) : null}
      {created ? (
        <Callout tone="ok" icon="check" role="status">
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              Ticket <strong className="mono">{created.display}</strong> created with status <strong>Open</strong>. Your team has an in-app notification.
            </span>
            <Button
              size="sm"
              onClick={() => {
                nav.setParams({ ticket: created.id });
                setCreated(null);
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
              <Chip
                key={f.value}
                active={filter === f.value}
                onClick={() => {
                  setFilter(f.value);
                  setPage(1);
                }}
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </div>
        <QueryState
          query={list}
          isEmpty={rows.length === 0}
          empty={{ title: "No tickets", text: filter === "all" ? "You haven't raised any tickets. Use New ticket if something isn't right." : "No tickets in this view." }}
          rows={3}
        >
          {rows.map((t) => (
            <div key={t.id} className="row">
              <span className="mono help">{t.display}</span>
              <span className="min-w-[180px] flex-1 font-medium">{t.title}</span>
              <Badge tone={TICKET_TONE[t.status]}>{t.status}</Badge>
              <span className="help">{t.updated}</span>
              <Button
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setCreated(null);
                  nav.setParams({ ticket: t.id, form: undefined });
                }}
              >
                View
              </Button>
            </div>
          ))}
          {meta && meta.totalPages > 1 ? (
            <Pager
              page={meta.page - 1}
              pageCount={meta.totalPages}
              total={meta.total}
              pageSize={PAGE_SIZE}
              noun="tickets"
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : null}
        </QueryState>
      </Card>
      {openId ? <OpenTicket key={openId} id={openId} onClose={() => nav.setParams({ ticket: undefined })} /> : null}
    </div>
  );
}
