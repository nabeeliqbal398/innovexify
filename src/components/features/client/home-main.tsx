"use client";

import { useMemo } from "react";

import { isDone, roleLabelOf } from "@/components/features/client/client-shared";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { CASE_TONE, DOC_STATUS, STAGES, TICKET_TONE } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { ago, dISO, fmtAt, fmtDay, relDay } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { acknowledgeAnnouncement } from "@/store/actions/comms";
import { projectOfClient, userName } from "@/store/selectors";
import type { Announcement } from "@/types/domain";

interface Update {
  text: string;
  who: string;
  role: string;
  at: number;
  time: string;
  kind: string;
}

const ANN_TONE = { Urgent: "err", Important: "warn", Normal: "q" } as const;
const ANN_SURFACE: Record<Announcement["prio"], string> = {
  Urgent: "border-[#FECACA] bg-danger-soft dark:border-danger/40",
  Important: "border-[#FDE68A] bg-warning-soft dark:border-warning/40",
  Normal: "",
};

function Stepper({ stageIdx, done }: { stageIdx: number; done: boolean }) {
  return (
    <ol tabIndex={0} aria-label="Formation milestones" className="m-0 flex list-none overflow-x-auto px-0.5 pb-0.5 pt-1">
      {STAGES.slice(1).map((label, i) => {
        const idx = i + 1;
        const complete = stageIdx > idx || done;
        const current = stageIdx === idx && !done;
        const state = complete ? "Completed" : current ? "Current stage" : "Upcoming";
        return (
          <li
            key={label}
            aria-label={`${label}: ${state}`}
            className={cn(
              "relative flex flex-[1_0_96px] flex-col items-center gap-[5px] px-1 text-center text-xs max-[640px]:flex-[0_0_84px]",
              "before:absolute before:left-[-50%] before:top-3 before:z-0 before:h-0.5 before:w-full before:bg-border first:before:hidden",
              complete && "text-success before:bg-success/50",
              current && "font-semibold text-primary-soft-foreground before:bg-primary/40",
              !complete && !current && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "relative z-[1] flex size-[26px] items-center justify-center rounded-full border-2 bg-surface text-xs font-bold",
                complete && "border-success bg-success text-surface",
                current && "border-primary text-primary-soft-foreground ring-4 ring-primary-soft",
                !complete && !current && "border-border-strong text-muted-foreground",
              )}
            >
              {complete ? "✓" : idx}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The Home page: welcome, announcements, formation progress and everything waiting on the client. */
export function HomeMain({ nav }: { nav: WorkspaceNav }) {
  const dispatch = useAppDispatch();
  const data = useData();
  const me = useMe();
  const project = projectOfClient(data, me.id);
  const csr = userName(data, me.csr);

  const myDocs = useMemo(() => data.docs.filter((d) => d.client === me.id), [data.docs, me.id]);
  const myTickets = useMemo(() => data.tickets.filter((t) => t.client === me.id), [data.tickets, me.id]);
  const today = dISO(0);
  const anns = data.anns.filter(
    (a) => a.status === "Published" && (a.aud === "all" || a.aud === me.id) && (!a.exp || a.exp >= today),
  );
  const pending = myDocs.filter((d) => d.status === "requested" || d.status === "rejected" || d.status === "info");
  const clientTasks = project ? data.tasks.filter((t) => t.project === project.id && t.vis === "client" && !t.done) : [];

  const actions = [
    ...myDocs
      .filter((d) => d.status === "requested" || d.status === "rejected")
      .map((d) => ({
        key: `doc-${d.id}`,
        text: `${d.status === "rejected" ? "Replace" : "Upload"}: ${d.name}${d.reason ? ` (${d.reason})` : ""}`,
        cta: "Upload",
        primary: true,
        go: () => nav.go("cdocs", { query: { doc: String(d.id) } }),
      })),
    ...clientTasks.map((t) => ({
      key: `task-${t.id}`,
      text: t.title,
      cta: "Message team",
      primary: false,
      go: () => nav.go("cmsgs"),
    })),
  ];

  const deadlines = [
    ...(project?.deadline && !isDone(project)
      ? [{ key: "target", date: project.deadline, title: "Target date for your formation", note: "Set by your team; the state's processing time may change it." }]
      : []),
    ...clientTasks
      .filter((t) => t.due)
      .map((t) => ({ key: `t-${t.id}`, date: t.due, title: t.title, note: "Shared by your team" })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  const updates: Update[] = [];
  (data.msgs[me.id] ?? []).forEach((m) => {
    const sender = data.users.find((u) => u.id === m.from);
    if (sender && sender.role !== "CLIENT") {
      updates.push({ text: m.text, who: sender.name, role: roleLabelOf(data, sender.id), at: m.at ?? 0, time: m.time, kind: "Message" });
    }
  });
  (project?.events ?? []).forEach((e) => {
    if (e.to) {
      updates.push({ text: `Your case moved to ${e.to}`, who: userName(data, e.by), role: roleLabelOf(data, e.by), at: e.at, time: fmtAt(e.at), kind: "Progress" });
    }
  });
  myDocs.forEach((d) =>
    d.history
      .filter((h) => h.status === "approved" || h.status === "rejected" || h.status === "info" || h.status === "shared")
      .forEach((h) =>
        updates.push({ text: `${d.name}: ${DOC_STATUS[h.status].label}`, who: userName(data, h.by), role: roleLabelOf(data, h.by), at: h.at, time: fmtAt(h.at), kind: "Document" }),
      ),
  );
  const recent = updates.sort((a, b) => b.at - a.at).slice(0, 5);

  const open = myTickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed").length;
  const resolved = myTickets.filter((t) => t.status === "Resolved").length;
  const ticketSummary = myTickets.length ? `${open} open · ${resolved} awaiting your confirmation` : "No tickets yet";
  const firstTickets = myTickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed").slice(0, 3);

  const openCenter = () => nav.go("home", { query: { view: "tickets" } });
  const newTicket = () => nav.go("home", { query: { view: "tickets", form: "1" } });
  const pct = project ? Math.round(((project.stageIdx >= 10 ? 11 : project.stageIdx) / 11) * 100) : 0;
  const done = project ? isDone(project) : false;

  return (
    <div className="stack-16">
      <section className="card flex flex-wrap items-center gap-3.5 p-[18px]">
        <div className="min-w-[280px] flex-1">
          <h1 className="h1">Welcome, {me.name.split(" ")[0]}</h1>
          <p className="help">Your {data.company.name} formation case at a glance.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className="mono rounded-md border border-border bg-background px-2.5 py-[5px] text-sm">Case ID {me.caseId}</span>
            {me.csr ? <Badge tone="q" className="h-7">Your CSR: {csr}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => nav.go("cmsgs")}>
            <Icon name="msg" small />
            Message your team
          </Button>
          <Button onClick={openCenter}>
            <Icon name="ticket" small />
            Ticket center
          </Button>
        </div>
      </section>

      {anns.map((a) => {
        const acked = a.ack && Boolean(a.acks[me.id]);
        return (
          <div key={a.id} className={cn("card flex flex-col gap-1 px-3.5 py-3", ANN_SURFACE[a.prio])}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ANN_TONE[a.prio]}>{a.prio}</Badge>
              <span className="font-semibold">{a.title}</span>
              <span className="help">· from {userName(data, a.by)}</span>
            </div>
            <span className="text-sm">{a.msg}</span>
            {a.ack && !acked ? (
              <Button size="sm" variant="primary" className="self-start" onClick={() => dispatch(acknowledgeAnnouncement(a.id))}>
                Acknowledge
              </Button>
            ) : null}
            {acked ? <span className="text-sm font-medium text-success">Acknowledged</span> : null}
          </div>
        );
      })}

      <Card>
        {project ? (
          <>
            <div className="card-h">
              <span className="h3">{me.biz || "Your LLC"}</span>
              <span className="help">
                {me.state || ""} · {project.id}
              </span>
              <Badge tone={CASE_TONE[project.status] ?? "q"} className="ml-auto">
                {project.status}
              </Badge>
            </div>
            <div className="card-b">
              <div className="flex flex-wrap justify-between gap-2.5 text-sm">
                <span>
                  Current stage: <strong>{STAGES[project.stageIdx]}</strong> · Next:{" "}
                  <strong>{project.stageIdx < 10 ? STAGES[project.stageIdx + 1] : "Formation complete"}</strong>
                </span>
                <span className="font-semibold">{pct}%</span>
              </div>
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Formation progress" className="h-1.5 min-w-[60px] overflow-hidden rounded-full bg-border">
                <span className="block h-full rounded-full bg-primary transition-[width] duration-[400ms]" style={{ width: `${pct}%` }} />
              </div>
              <Stepper stageIdx={project.stageIdx} done={done} />
            </div>
          </>
        ) : (
          <EmptyState title="Your case is being set up" text={`Your formation progress will appear here once the team opens your case. Your CSR: ${csr}`} />
        )}
      </Card>

      <div className="grid2">
        <Card>
          <CardHeader title="Action required" aside={<Badge tone="warn">{actions.length}</Badge>} />
          {actions.map((a) => (
            <div key={a.key} className="row">
              <span className="min-w-[180px] flex-1 text-sm">{a.text}</span>
              <Button size="sm" variant={a.primary ? "primary" : "default"} onClick={a.go}>
                {a.cta}
              </Button>
            </div>
          ))}
          {actions.length === 0 ? <EmptyState title="You're all caught up" text="Nothing is needed from you right now." /> : null}
        </Card>

        <Card>
          <CardHeader title="Document requests" />
          {pending.map((d) => {
            const note = d.reason || d.note || "";
            return (
              <button
                key={d.id}
                type="button"
                className="row w-full cursor-pointer flex-nowrap text-left hover:bg-background"
                onClick={() => nav.go("cdocs", { query: { doc: String(d.id) } })}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{d.name}</span>
                  <span className="help">{d.requestedAt ? `Requested ${ago(d.requestedAt)}` : ""}</span>
                  {note ? <span className="mini">{note}</span> : null}
                </span>
                <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
              </button>
            );
          })}
          {pending.length === 0 ? <EmptyState title="No open requests" text="When your team needs a document it appears here." /> : null}
        </Card>

        <Card>
          <CardHeader title="Upcoming dates" />
          {deadlines.map((d) => (
            <div key={d.key} className="row">
              <span className="mono help w-[90px]">{fmtDay(d.date)}</span>
              <span className="flex min-w-[180px] flex-1 flex-col">
                <span className="text-sm font-medium">{d.title}</span>
                <span className="help">{d.note}</span>
              </span>
              <Badge tone="q">{relDay(d.date)}</Badge>
            </div>
          ))}
          {deadlines.length === 0 ? <EmptyState title="No dates scheduled" /> : null}
        </Card>

        <Card>
          <CardHeader title="Support tickets">
            <Button size="sm" variant="primary" onClick={newTicket}>
              New ticket
            </Button>
          </CardHeader>
          <div className="row">
            <span className="mini flex-1">{ticketSummary}</span>
            <Button size="sm" onClick={openCenter}>
              Open ticket center
            </Button>
          </div>
          {firstTickets.map((t) => (
            <div key={t.id} className="row">
              <span className="mono help">{t.id}</span>
              <span className="min-w-[140px] flex-1 text-sm font-medium">{t.title}</span>
              <Badge tone={TICKET_TONE[t.status]}>{t.status}</Badge>
              <Button size="sm" onClick={() => nav.go("home", { query: { view: "tickets", ticket: t.id } })}>
                View
              </Button>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent team updates">
          <Button size="sm" onClick={() => nav.go("cmsgs")}>
            Open messages
          </Button>
        </CardHeader>
        {recent.map((m, i) => (
          <div key={`${m.kind}-${m.at}-${i}`} className="row">
            <Badge tone="q">{m.kind}</Badge>
            <span className="min-w-[220px] flex-1 text-sm">{m.text}</span>
            <span className="help">
              {m.who} · {m.role} · {m.time}
            </span>
          </div>
        ))}
        {recent.length === 0 ? <EmptyState title="No updates yet" text="Messages, progress and document decisions from your team appear here." /> : null}
      </Card>
    </div>
  );
}
