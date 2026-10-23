import type { ActivityItem, Deadline, Kpi, ListItem, Overview, ReviewItem, Shortcut, Target, WorkloadRow } from "@/components/features/overview/overview-model";
import { DOC_STATUS, ROLE_LABEL, ROLE_TONE, STAGES, type BadgeTone } from "@/constants/vocab";
import { ago, fmtDay, initials, plural, relDay } from "@/lib/dates";
import type { Bucket } from "@/components/features/overview/buckets";
import type { Role, User } from "@/types/domain";
import { toMs } from "./common";
import { CASE_STAGE, DOC_STATUS_MAP, ROLES } from "./enums";

/** `GET /dashboard/overview`. */
export interface ApiOverview {
  role: string;
  kpis: Array<{ key: string; value: number; detail?: number }>;
  stageDistribution?: Array<{ stage: string; count: number }>;
  trends?: {
    casesCompletedByMonth: Array<{ label: string; count: number }>;
    casesCompletedByWeek: Array<{ label: string; count: number }>;
    tasksDoneByMonth: Array<{ label: string; count: number }>;
    tasksDoneByWeek: Array<{ label: string; count: number }>;
  };
  deadlines?: Array<{ kind: "case" | "task"; id: string; title: string; date: string; daysFromToday: number }>;
  workload?: { csrs: ApiWorkloadRow[]; compliance: ApiWorkloadRow[] };
  needsAttention?: Array<{ kind: string; id: string; title: string; detail: string }>;
  activity?: Array<{ at: string; actor: string | null; actorRole: string | null; action: string; target: string }>;
  recentReviews?: Array<{ document: string; client: string; status: string; by: string | null; at: string }>;
}

interface ApiWorkloadRow {
  id: string;
  name: string;
  clients: number;
  openFollowUps: number;
  openTickets: number;
  ownedCases: number;
  openTasks: number;
  reviewsLast30Days: number;
  load: number;
}

/** `GET /dashboard/nav-counts`. */
export interface NavCounts {
  messages: number;
  cmsgs: number;
  documents: number;
  tickets: number;
  reports: number;
  followups: number;
  tasks: number;
}

const target = (view: string, query?: Record<string, string>, id?: string): Target => ({ view, query, id });
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-09` becomes "Sep". */
const monthLabel = (label: string): string => MONTH_NAMES[Number(label.slice(5, 7)) - 1] ?? label;
/** `2026-08-28` becomes "28 Aug". */
const weekLabel = (label: string): string => `${Number(label.slice(8, 10))} ${MONTH_NAMES[Number(label.slice(5, 7)) - 1] ?? ""}`;
const buckets = (rows: Array<{ label: string; count: number }> | undefined, name: (l: string) => string): Bucket[] => (rows ?? []).map((r) => ({ label: name(r.label), n: r.count }));

interface KpiSpec {
  label: string;
  sub: (value: number, detail: number | undefined) => string;
  target: Target;
  tone?: (value: number, detail: number | undefined) => Kpi["tone"];
}

const KPI_SPECS: Record<string, KpiSpec> = {
  totalClients: { label: "Total clients", sub: (_v, d) => `${d ?? 0} active cases`, target: target("clients") },
  awaitingClientInformation: { label: "Awaiting client information", sub: () => "Information or documents needed", target: target("cases", { status: "Awaiting Client" }) },
  underComplianceReview: { label: "Under compliance review", sub: () => "Documents Under Review", target: target("cases", { stage: "Documents Under Review" }) },
  stateFilingsInProgress: { label: "State filings in progress", sub: () => "Manual tracker", target: target("cases", { stage: "State Filing in Progress" }) },
  completedFormations: { label: "Completed formations", sub: () => "All time", target: target("cases", { status: "Completed" }) },
  openTasks: { label: "Open tasks", sub: (_v, d) => `${d ?? 0} overdue`, target: target("tasks", { filter: "open" }), tone: (_v, d) => ((d ?? 0) > 0 ? "err" : undefined) },
  pendingDocumentReviews: { label: "Pending document reviews", sub: () => "", target: target("documents"), tone: (v) => (v > 0 ? "warn" : undefined) },
  openTickets: { label: "Open tickets", sub: (_v, d) => (d === undefined ? "" : `${d} escalated or high priority`), target: target("tickets"), tone: (_v, d) => ((d ?? 0) > 0 ? "err" : undefined) },
  complianceReports: { label: "Compliance reports", sub: (_v, d) => `${d ?? 0} awaiting review`, target: target("reports") },
  assignedClients: { label: "Assigned clients", sub: (_v, d) => `${d ?? 0} still invited`, target: target("clients") },
  activeCases: { label: "Active cases", sub: () => "", target: target("projects") },
  followUpsDue: { label: "Follow-ups due", sub: (_v, d) => `${d ?? 0} overdue`, target: target("followups", { filter: "today" }) },
  pendingClientResponses: { label: "Pending client responses", sub: () => "Documents or replies needed", target: target("clients") },
  followUpsCompletedLast30Days: { label: "Completed follow-ups", sub: () => "Last 30 days", target: target("followups", { filter: "done" }) },
  documentsAwaitingReview: { label: "Documents awaiting review", sub: () => "", target: target("documents"), tone: (v) => (v > 0 ? "warn" : undefined) },
  documentsNeedingCorrection: { label: "Documents needing correction", sub: () => "Waiting on the client", target: target("requests") },
  upcomingComplianceDeadlines: { label: "Upcoming compliance deadlines", sub: () => "Next 14 days", target: target("calendar") },
  blockedByMissingInformation: { label: "Blocked by missing information", sub: () => "", target: target("clients") },
  activeComplianceMilestones: { label: "Active compliance milestones", sub: () => "", target: target("projects") },
  highPriorityCases: { label: "High-priority cases", sub: () => "", target: target("clients") },
  reportsAwaitingReview: { label: "CSR reports awaiting review", sub: () => "", target: target("reports") },
};

function mapKpis(rows: ApiOverview["kpis"]): Kpi[] {
  return rows.flatMap((r) => {
    const spec = KPI_SPECS[r.key];
    if (!spec) return []; // a figure the server added that this screen has no wording for yet
    const tone = spec.tone?.(r.value, r.detail);
    return [{ label: spec.label, value: String(r.value), sub: spec.sub(r.value, r.detail), ...(tone ? { tone } : {}), target: spec.target }];
  });
}

function shortcutsFor(role: Role): Shortcut[] {
  const invite = (label: string, r: string): Shortcut => ({ label, icon: "userPlus", primary: r === "CLIENT", target: target("staff", { invite: r }) });
  if (role === "ADMIN" || role === "MANAGER") {
    const rest: Shortcut[] = [
      ...(role === "ADMIN" ? [invite("Invite Manager", "MANAGER")] : []),
      invite("Invite CSR", "CSR"),
      invite("Invite Compliance", "COMPLIANCE"),
      invite("Invite client", "CLIENT"),
    ];
    return [
      { label: "New case", icon: "plus", primary: true, target: target("cases", { new: "1" }) },
      { label: "New task", icon: "tasks", target: target("tasks", { new: "1" }) },
      ...rest.slice(0, role === "ADMIN" ? 4 : 3),
    ];
  }
  if (role === "CSR") {
    return [
      { label: "Invite client", icon: "userPlus", primary: true, target: target("staff") },
      { label: "Message a client", icon: "msg", target: target("messages") },
      { label: "Report to Compliance", icon: "clipboard", target: target("reports") },
      { label: "Tickets", icon: "ticket", target: target("tickets") },
    ];
  }
  return [
    { label: "Review submissions", icon: "file", primary: true, target: target("documents") },
    { label: "Request a document", icon: "filePlus", target: target("requests") },
    { label: "Publish announcement", icon: "megaphone", target: target("announcements") },
    { label: "CSR reports", icon: "clipboard", target: target("reports") },
  ];
}

function mapDeadlines(rows: NonNullable<ApiOverview["deadlines"]>): Deadline[] {
  return rows.map((d, i) => {
    const tone: BadgeTone = d.daysFromToday < 0 ? "err" : d.daysFromToday === 0 ? "warn" : "q";
    return {
      key: `${d.kind}-${d.id}-${i}`,
      title: d.title,
      kind: d.kind === "case" ? "Case" : "Task",
      rel: relDay(d.date),
      day: fmtDay(d.date),
      tone,
      target: d.kind === "case" ? target("cases", undefined, d.id) : target("tasks", { task: d.id }),
    };
  });
}

function mapWorkload(rows: ApiWorkloadRow[], kind: "csr" | "comp"): WorkloadRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    a: kind === "csr" ? plural(r.clients, "client") : plural(r.ownedCases, "owned case"),
    b: kind === "csr" ? plural(r.openFollowUps, "open follow-up") : plural(r.openTasks, "open task"),
    c: kind === "csr" ? plural(r.openTickets, "open ticket") : `${plural(r.reviewsLast30Days, "review")} (30 days)`,
    load: Math.min(100, r.load),
    target: target("staff", { staff: r.id }),
  }));
}

function mapAttention(rows: NonNullable<ApiOverview["needsAttention"]>): ListItem[] {
  return rows.map((r): ListItem => {
    switch (r.kind) {
      case "unassignedClient":
        return { key: `un-${r.id}`, title: r.title, meta: r.detail, tone: "err", tag: "Unassigned", cta: "Assign", target: target("clients") };
      case "documentToReview":
        return { key: `doc-${r.id}`, title: r.title, meta: r.detail, tone: "warn", tag: "Review", cta: "Review", target: target("documents", { doc: r.id }) };
      case "ticket":
        return { key: `tk-${r.id}`, title: r.title, meta: r.detail, tone: "info", tag: "Ticket", cta: "View", target: target("tickets", { ticket: r.id }) };
      default:
        return { key: `cl-${r.id}`, title: r.title, meta: r.detail, tone: "warn", tag: "Follow up", cta: "Message", target: target("messages", { c: r.id }) };
    }
  });
}

function mapActivity(rows: NonNullable<ApiOverview["activity"]>): ActivityItem[] {
  return rows.map((a, i) => {
    const role = a.actorRole ? ROLES.toLabel(a.actorRole) : undefined;
    const at = toMs(a.at);
    return {
      key: `${a.at}-${i}`,
      actor: a.actor ?? "?",
      initials: initials(a.actor ?? undefined),
      isClient: role === "CLIENT",
      role: role ? ROLE_LABEL[role] : "",
      roleTone: role ? ROLE_TONE[role] : "q",
      action: a.action,
      target: a.target,
      time: ago(at),
    };
  });
}

function mapReviews(rows: NonNullable<ApiOverview["recentReviews"]>): ReviewItem[] {
  return rows.map((r, i) => {
    const status = DOC_STATUS[DOC_STATUS_MAP.toLabel(r.status)];
    return { key: `rv-${i}-${r.at}`, title: `${r.document} · ${r.client}`, meta: `${status.label} by ${r.by ?? "—"} · ${ago(toMs(r.at))}`, tone: status.tone, tag: status.label };
  });
}

/** What the staff overview shows for one role, from `GET /dashboard/overview`. */
export function mapOverview(api: ApiOverview, me: User): Overview {
  const role = me.role;
  const biz = role === "ADMIN" || role === "MANAGER";
  const stageCounts = new Map((api.stageDistribution ?? []).map((s) => [CASE_STAGE.toLabel(s.stage), s.count]));
  const title = role === "ADMIN" ? "Business overview" : role === "MANAGER" ? "Operations overview" : role === "CSR" ? "My work" : "Compliance overview";
  const sub =
    role === "CSR"
      ? "Your clients, follow-ups and tickets. Figures are counted from the records you can see, not a performance score."
      : role === "COMPLIANCE"
        ? "Documents, milestones and CSR reports."
        : "Counted from the live records you can see.";
  return {
    title,
    sub,
    kpis: mapKpis(api.kpis),
    shortcuts: shortcutsFor(role),
    biz,
    comp: role === "COMPLIANCE",
    stageDist: biz ? STAGES.map((st) => ({ label: st, n: stageCounts.get(st) ?? 0, target: target("cases", { stage: st }) })) : [],
    trendMonthly: buckets(api.trends?.casesCompletedByMonth, monthLabel),
    trendWeekly: buckets(api.trends?.casesCompletedByWeek, weekLabel),
    tasksMonthly: buckets(api.trends?.tasksDoneByMonth, monthLabel),
    tasksWeekly: buckets(api.trends?.tasksDoneByWeek, weekLabel),
    deadlines: mapDeadlines(api.deadlines ?? []),
    workCsr: mapWorkload(api.workload?.csrs ?? [], "csr"),
    workComp: mapWorkload(api.workload?.compliance ?? [], "comp"),
    listTitle: role === "CSR" ? "Clients awaiting follow-up" : role === "COMPLIANCE" ? "Waiting on Compliance" : "Needs attention",
    list: mapAttention(api.needsAttention ?? []),
    activity: mapActivity(api.activity ?? []),
    reviews: mapReviews(api.recentReviews ?? []),
  };
}
