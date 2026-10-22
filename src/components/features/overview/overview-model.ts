import { COMP_STAGES, DOC_STATUS, ROLE_LABEL, ROLE_TONE, STAGES, TICKET_TONE, type BadgeTone } from "@/constants/vocab";
import { ago, daysFromToday, dISO, fmtDay, initials, plural, relDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { staffTickets, unreadIn } from "@/components/features/workspace/nav-counts";
import type { ClientDoc, DemoData, Project, User } from "@/types/domain";
import { monthBuckets, weekBuckets, type Bucket } from "./buckets";

const DAY = 86_400_000;

/** Where a tile, bar or row leads. Query names are the contract with the destination views. */
export interface Target {
  view: string;
  id?: string;
  query?: Record<string, string>;
}

export interface Kpi {
  label: string;
  value: string;
  sub: string;
  tone?: "warn" | "err";
  target: Target;
}
export interface Shortcut {
  label: string;
  icon: "plus" | "tasks" | "userPlus" | "file" | "ticket" | "msg" | "clipboard" | "filePlus" | "megaphone";
  primary?: boolean;
  target: Target;
}
export interface StageBar {
  label: string;
  n: number;
  target: Target;
}
export interface Deadline {
  key: string;
  title: string;
  kind: string;
  rel: string;
  day: string;
  tone: BadgeTone;
  target: Target;
}
export interface WorkloadRow {
  id: string;
  name: string;
  a: string;
  b: string;
  c: string;
  load: number;
  target: Target;
}
export interface ListItem {
  key: string;
  title: string;
  meta: string;
  tone: BadgeTone;
  tag: string;
  cta: string;
  target: Target;
}
export interface ActivityItem {
  key: string;
  actor: string;
  initials: string;
  isClient: boolean;
  role: string;
  roleTone: BadgeTone;
  action: string;
  target: string;
  time: string;
}
export interface ReviewItem {
  key: string;
  title: string;
  meta: string;
  tone: BadgeTone;
  tag: string;
}

export interface Overview {
  title: string;
  sub: string;
  kpis: Kpi[];
  shortcuts: Shortcut[];
  biz: boolean;
  comp: boolean;
  stageDist: StageBar[];
  trendMonthly: Bucket[];
  trendWeekly: Bucket[];
  tasksMonthly: Bucket[];
  tasksWeekly: Bucket[];
  deadlines: Deadline[];
  workCsr: WorkloadRow[];
  workComp: WorkloadRow[];
  listTitle: string;
  list: ListItem[];
  activity: ActivityItem[];
  reviews: ReviewItem[];
}

export const isDone = (p: Project): boolean => p.stageIdx >= 10 || p.status === "Completed";
const target = (view: string, query?: Record<string, string>, id?: string): Target => ({ view, query, id });

function workload(data: DemoData, u: User) {
  const clients = data.users.filter((c) => c.role === "CLIENT" && c.status !== "Removed" && c.csr === u.id);
  const cases =
    clients.filter((c) => {
      const p = data.projects.find((x) => x.client === c.id);
      return p && !isDone(p);
    }).length + data.projects.filter((p) => p.owner === u.id && !isDone(p)).length;
  return {
    clients: clients.length,
    cases,
    tasks: data.tasks.filter((t) => t.assignee === u.id && !t.done).length,
    followups: data.followups.filter((f) => f.csr === u.id && f.status === "Open").length,
    tickets: data.tickets.filter((t) => t.handler === u.id && t.status !== "Resolved" && t.status !== "Closed").length,
    reviews: data.docs.filter((d) => d.reviewedBy === u.id && (d.reviewedAt ?? 0) > Date.now() - 30 * DAY).length,
  };
}

interface Scope {
  data: DemoData;
  me: User;
  clients: User[];
  active: Project[];
  scoped: Project[];
  queue: ClientDoc[];
  openTicketsN: number;
  escalated: number;
  nameOf: (id?: string) => string;
}

function bizKpis(s: Scope): Kpi[] {
  const openTasks = s.data.tasks.filter((t) => !t.done);
  const overdue = openTasks.filter((t) => t.due && t.due < dISO(0)).length;
  const { active } = s;
  return [
    { label: "Total clients", value: String(s.clients.length), sub: `${active.length} active cases`, target: target("clients") },
    {
      label: "Awaiting client information",
      value: String(active.filter((p) => p.stageIdx === 2 || p.stageIdx === 3 || p.status === "Awaiting Client").length),
      sub: "Information or documents needed",
      target: target("cases", { status: "Awaiting Client" }),
    },
    {
      label: "Under compliance review",
      value: String(active.filter((p) => p.stageIdx === 4).length),
      sub: "Documents Under Review",
      target: target("cases", { stage: "Documents Under Review" }),
    },
    {
      label: "State filings in progress",
      value: String(active.filter((p) => p.stageIdx === 6).length),
      sub: "Manual tracker",
      target: target("cases", { stage: "State Filing in Progress" }),
    },
    {
      label: "Completed formations",
      value: String(s.scoped.filter(isDone).length),
      sub: "All time in this demo",
      target: target("cases", { status: "Completed" }),
    },
    {
      label: "Open tasks",
      value: String(openTasks.length),
      sub: `${overdue} overdue`,
      tone: overdue ? "err" : undefined,
      target: target("tasks", { filter: "open" }),
    },
    { label: "Pending document reviews", value: String(s.queue.length), sub: "", tone: s.queue.length ? "warn" : undefined, target: target("documents") },
    {
      label: "Open tickets",
      value: String(s.openTicketsN),
      sub: `${s.escalated} escalated or high priority`,
      tone: s.escalated ? "err" : undefined,
      target: target("tickets"),
    },
  ];
}

function bizDeadlines(s: Scope): Deadline[] {
  const raw: Array<{ date: string; title: string; kind: string; target: Target }> = [
    ...s.active
      .filter((p) => p.deadline && daysFromToday(p.deadline) <= 14)
      .map((p) => ({ date: p.deadline, title: `${p.id} target date · ${s.nameOf(p.client)}`, kind: "Case", target: target("cases", undefined, p.id) })),
    ...s.data.tasks
      .filter((t) => !t.done && t.due && daysFromToday(t.due) <= 7)
      .map((t) => ({ date: t.due, title: t.title, kind: `Task · ${s.nameOf(t.assignee)}`, target: target("tasks", { task: String(t.id) }) })),
  ];
  return raw
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 8)
    .map((x, i) => {
      const n = daysFromToday(x.date);
      return {
        key: `${x.kind}-${x.date}-${i}`,
        title: x.title,
        kind: x.kind,
        rel: relDay(x.date),
        day: fmtDay(x.date),
        tone: n < 0 ? "err" : n === 0 ? "warn" : "q",
        target: x.target,
      };
    });
}

function fillBusiness(out: Overview, s: Scope, unassigned: User[], openTickets: ReturnType<typeof staffTickets>, submittedReports: number): void {
  const { data, me } = s;
  const isAdmin = me.role === "ADMIN";
  const staffActive = data.users.filter((u) => u.role !== "CLIENT" && u.status === "Active");
  const invite = (label: string, r: string): Shortcut => ({ label, icon: "userPlus", primary: r === "CLIENT", target: target("staff", { invite: r }) });
  const rest: Shortcut[] = [
    ...(isAdmin ? [invite("Invite Manager", "MANAGER")] : []),
    invite("Invite CSR", "CSR"),
    invite("Invite Compliance", "COMPLIANCE"),
    invite("Invite client", "CLIENT"),
    { label: "Review documents", icon: "file", target: target("documents") },
    { label: "Manage tickets", icon: "ticket", target: target("tickets") },
  ];
  out.biz = true;
  out.title = isAdmin ? "Business overview" : "Operations overview";
  out.sub = `${data.company.name} · demo data, not live metrics`;
  out.kpis = bizKpis(s);
  if (!isAdmin) {
    out.kpis.push({
      label: "Compliance reports",
      value: String(data.reports.length),
      sub: `${submittedReports} awaiting review`,
      target: target("reports"),
    });
  }
  out.shortcuts = [
    { label: "New case", icon: "plus", primary: true, target: target("cases", { new: "1" }) },
    { label: "New task", icon: "tasks", target: target("tasks", { new: "1" }) },
    ...rest.slice(0, isAdmin ? 4 : 3),
  ];
  out.stageDist = STAGES.map((st, i) => ({
    label: st,
    n: s.scoped.filter((p) => p.stageIdx === i).length,
    target: target("cases", { stage: st }),
  }));
  const completed = s.scoped.filter((p) => p.completedAt);
  const doneTasks = data.tasks.filter((t) => t.done);
  out.trendMonthly = monthBuckets(6, (p) => p.completedAt ?? 0, completed);
  out.trendWeekly = weekBuckets(8, (p) => p.completedAt ?? 0, completed);
  out.tasksMonthly = monthBuckets(6, (t) => t.completedAt ?? 0, doneTasks);
  out.tasksWeekly = weekBuckets(8, (t) => t.completedAt ?? 0, doneTasks);
  out.deadlines = bizDeadlines(s);
  const row = (u: User, a: string, b: string, c: string, load: number): WorkloadRow => ({
    id: u.id,
    name: u.name,
    a,
    b,
    c,
    load: Math.min(100, load),
    target: target("staff", { staff: u.id }),
  });
  out.workCsr = staffActive
    .filter((u) => u.role === "CSR")
    .map((u) => {
      const w = workload(data, u);
      return row(u, plural(w.clients, "client"), plural(w.followups, "open follow-up"), plural(w.tickets, "open ticket"), w.clients * 12 + w.followups * 8 + w.tickets * 10);
    });
  out.workComp = staffActive
    .filter((u) => u.role === "COMPLIANCE")
    .map((u) => {
      const w = workload(data, u);
      return row(u, plural(w.cases, "owned case"), plural(w.tasks, "open task"), `${plural(w.reviews, "review")} (30 days)`, w.cases * 14 + w.tasks * 10);
    });
  out.listTitle = "Needs attention";
  out.list = [
    ...unassigned.map((c) => unassignedItem(c, `${c.name} has no CSR`, `${c.caseId ?? ""} · ${c.status}`)),
    ...s.queue.slice(0, 3).map((d) => queueItem(s, d)),
    ...openTickets.slice(0, 3).map((t) => ({
      key: `tk-${t.id}`,
      title: `${t.id} · ${t.title}`,
      meta: `${s.nameOf(t.client)} · ${t.status}`,
      tone: TICKET_TONE[t.status],
      tag: t.priority,
      cta: "View",
      target: target("tickets", { ticket: t.id }),
    })),
  ];
}

function unassignedItem(c: User, title: string, meta: string): ListItem {
  return { key: `un-${c.id}`, title, meta, tone: "err", tag: "Unassigned", cta: "Assign", target: target("clients") };
}

function queueItem(s: Scope, d: ClientDoc): ListItem {
  const c = s.data.users.find((u) => u.id === d.client);
  return {
    key: `doc-${d.id}`,
    title: d.file,
    meta: `${c?.name ?? "—"} · ${c?.caseId ?? ""}`,
    tone: "warn",
    tag: "Review",
    cta: "Review",
    target: target("documents", { doc: String(d.id) }),
  };
}

function fillCsr(out: Overview, s: Scope, mine: User[], unassigned: User[], openTicketsN: number): void {
  const { data, me } = s;
  const today = dISO(0);
  const byId = (id: string) => data.users.find((u) => u.id === id);
  const myFollowups = data.followups.filter((f) => f.csr === me.id);
  const needsClient = (c: User) => data.docs.some((d) => d.client === c.id && (d.status === "requested" || d.status === "rejected"));
  out.title = "My work";
  out.sub = "Your clients, follow-ups and tickets. Figures come from the demo records, not a performance score.";
  out.kpis = [
    { label: "Assigned clients", value: String(mine.length), sub: `${mine.filter((c) => c.status === "Invited").length} still invited`, target: target("clients") },
    {
      label: "Active cases",
      value: String(
        mine.filter((c) => {
          const p = data.projects.find((x) => x.client === c.id);
          return p && !isDone(p);
        }).length,
      ),
      sub: "",
      target: target("projects"),
    },
    {
      label: "Follow-ups due",
      value: String(myFollowups.filter((f) => f.status === "Open" && f.due <= today).length),
      sub: `${myFollowups.filter((f) => f.status === "Open" && f.due < today).length} overdue`,
      target: target("followups", { filter: "today" }),
    },
    {
      label: "Pending client responses",
      value: String(
        data.docs.filter((d) => byId(d.client)?.csr === me.id && (d.status === "requested" || d.status === "rejected" || d.status === "info")).length +
          data.tickets.filter((t) => byId(t.client)?.csr === me.id && t.status === "Waiting for Client").length,
      ),
      sub: "Documents or replies needed",
      target: target("clients"),
    },
    { label: "Open tickets", value: String(openTicketsN), sub: "", target: target("tickets") },
    {
      label: "Completed follow-ups",
      value: String(myFollowups.filter((f) => f.status === "Done" && (f.doneAt ?? 0) > Date.now() - 30 * DAY).length),
      sub: "Last 30 days",
      target: target("followups", { filter: "done" }),
    },
  ];
  out.shortcuts = [
    { label: "Invite client", icon: "userPlus", primary: true, target: target("staff") },
    { label: "Message a client", icon: "msg", target: target("messages") },
    { label: "Report to Compliance", icon: "clipboard", target: target("reports") },
    { label: "Tickets", icon: "ticket", target: target("tickets") },
  ];
  out.listTitle = "Clients awaiting follow-up";
  out.list = [
    ...mine
      .filter((c) => unreadIn(data, me, c.id) > 0 || c.status === "Invited" || needsClient(c))
      .map((c): ListItem => {
        const u = unreadIn(data, me, c.id);
        return {
          key: `cl-${c.id}`,
          title: c.name,
          meta: `${c.caseId ?? ""}${u ? ` · ${u} unread` : ""}${c.status === "Invited" ? " · invitation pending" : ""}`,
          tone: u ? "brand" : "warn",
          tag: u ? "Unread" : "Follow up",
          cta: "Message",
          target: target("messages", { c: c.id }),
        };
      }),
    ...unassigned.map((c) => unassignedItem(c, `${c.name} needs a CSR`, c.caseId ?? "")),
  ];
}

function fillCompliance(out: Overview, s: Scope, submitted: DemoData["reports"]): void {
  const { data } = s;
  const { active, queue } = s;
  const compDeadlines =
    active.filter((p) => p.deadline && daysFromToday(p.deadline) <= 14).length +
    data.filings.filter((f) => f.nextDate && daysFromToday(f.nextDate) <= 14 && f.status !== "Approved").length;
  out.comp = true;
  out.title = "Compliance overview";
  out.sub = "Documents, milestones and CSR reports.";
  out.kpis = [
    { label: "Documents awaiting review", value: String(queue.length), sub: "", tone: queue.length ? "warn" : undefined, target: target("documents") },
    {
      label: "Documents needing correction",
      value: String(data.docs.filter((d) => d.status === "rejected" || d.status === "info").length),
      sub: "Waiting on the client",
      target: target("requests"),
    },
    { label: "Upcoming compliance deadlines", value: String(compDeadlines), sub: "Next 14 days", target: target("calendar") },
    {
      label: "Blocked by missing information",
      value: String(active.filter((p) => p.status === "Blocked" || p.stageIdx === 2).length),
      sub: "",
      target: target("clients"),
    },
    {
      label: "Active compliance milestones",
      value: String(active.filter((p) => COMP_STAGES.includes(STAGES[p.stageIdx])).length),
      sub: "",
      target: target("projects"),
    },
    {
      label: "High-priority cases",
      value: String(active.filter((p) => p.priority === "High" || p.priority === "Urgent").length),
      sub: "",
      target: target("clients"),
    },
    { label: "CSR reports awaiting review", value: String(submitted.length), sub: "", target: target("reports") },
  ];
  out.shortcuts = [
    { label: "Review submissions", icon: "file", primary: true, target: target("documents") },
    { label: "Request a document", icon: "filePlus", target: target("requests") },
    { label: "Publish announcement", icon: "megaphone", target: target("announcements") },
    { label: "CSR reports", icon: "clipboard", target: target("reports") },
  ];
  out.listTitle = "Waiting on Compliance";
  out.list = [
    ...queue.map((d) => queueItem(s, d)),
    ...submitted.map((r): ListItem => ({
      key: `rp-${r.id}`,
      title: `${r.id} · ${r.title}`,
      meta: `From ${s.nameOf(r.csr)} · ${s.nameOf(r.client)}`,
      tone: "brand",
      tag: "Report",
      cta: "View",
      target: target("reports", { report: r.id }),
    })),
  ];
  out.reviews = data.docs
    .flatMap((d) => d.history.filter((h) => h.status === "approved" || h.status === "rejected" || h.status === "info").map((h) => ({ d, h })))
    .sort((a, b) => b.h.at - a.h.at)
    .slice(0, 6)
    .map((x, i) => ({
      key: `rv-${x.d.id}-${i}`,
      title: `${x.d.name} · ${s.nameOf(x.d.client)}`,
      meta: `${DOC_STATUS[x.h.status].label} by ${s.nameOf(x.h.by)} · ${ago(x.h.at)}`,
      tone: DOC_STATUS[x.h.status].tone,
      tag: DOC_STATUS[x.h.status].label,
    }));
}

/** Everything the staff overview shows for one role, derived from the demo data. */
export function buildOverview(data: DemoData, me: User): Overview {
  const byId = (id: string) => data.users.find((u) => u.id === id);
  const nameOf = (id?: string) => data.users.find((u) => u.id === id)?.name ?? "Unassigned";
  const clients = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed");
  const openTickets = staffTickets(data, me).filter((t) => t.status !== "Resolved" && t.status !== "Closed");
  const scoped = data.projects.filter((p) => {
    const c = byId(p.client);
    return c && c.status !== "Removed" && can(me, "viewClient", c);
  });
  const scope: Scope = {
    data,
    me,
    clients,
    scoped,
    active: scoped.filter((p) => !isDone(p)),
    queue: data.docs.filter((d) => d.status === "submitted"),
    openTicketsN: openTickets.length,
    escalated: openTickets.filter((t) => t.escalated || t.priority === "High" || t.priority === "Urgent").length,
    nameOf,
  };
  const unassigned = clients.filter((c) => !c.csr);
  const mine = clients.filter((c) => c.csr === me.id);
  const submitted = data.reports.filter((r) => r.status === "Submitted");

  let activity = data.audit.filter((a) => a.ok);
  if (me.role === "CSR") {
    activity = activity.filter((a) => a.actor === me.id || mine.some((c) => a.target === c.caseId || a.target === c.name));
  }

  const out: Overview = {
    title: "",
    sub: "",
    kpis: [],
    shortcuts: [],
    biz: false,
    comp: false,
    stageDist: [],
    trendMonthly: [],
    trendWeekly: [],
    tasksMonthly: [],
    tasksWeekly: [],
    deadlines: [],
    workCsr: [],
    workComp: [],
    listTitle: "",
    list: [],
    activity: activity.slice(0, 7).map((a, i) => {
      const u = byId(a.actor);
      const r = a.role ?? u?.role;
      return {
        key: `${a.at}-${i}`,
        actor: u?.name ?? "?",
        initials: initials(u?.name),
        isClient: u?.role === "CLIENT",
        role: r ? ROLE_LABEL[r] : "",
        roleTone: r ? ROLE_TONE[r] : "q",
        action: a.action,
        target: a.target,
        time: a.time,
      };
    }),
    reviews: [],
  };

  if (me.role === "ADMIN" || me.role === "MANAGER") fillBusiness(out, scope, unassigned, openTickets, submitted.length);
  else if (me.role === "CSR") fillCsr(out, scope, mine, unassigned, openTickets.length);
  else fillCompliance(out, scope, submitted);
  return out;
}
