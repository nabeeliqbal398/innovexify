import { CASE_STATUSES, STAGES } from "@/constants/vocab";
import { can } from "@/lib/permissions";
import { dISO } from "@/lib/dates";
import { isDone } from "@/components/features/overview/overview-model";
import { monthBuckets, type Bucket } from "@/components/features/overview/buckets";
import type { DemoData, User } from "@/types/domain";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type RangeKey = "30" | "90" | "365" | "all";

export const RANGES: ReadonlyArray<{ value: RangeKey; label: string; phrase: string }> = [
  { value: "30", label: "Last 30 days", phrase: "last 30 days" },
  { value: "90", label: "Last 90 days", phrase: "last 90 days" },
  { value: "365", label: "Last 12 months", phrase: "last 12 months" },
  { value: "all", label: "All time", phrase: "all time" },
];

export interface CsrRow {
  id: string;
  name: string;
  clients: number;
  open: number;
  done: number;
  inter: number;
  tickets: number;
}
export interface CompRow {
  id: string;
  name: string;
  reviews: number;
  cases: number;
  tasks: number;
  reports: number;
}
export interface OnboardRow {
  label: string;
  n: number;
  pct: number;
}

export interface Analytics {
  stage: Bucket[];
  status: Bucket[];
  monthly: Bucket[];
  completed: number;
  avgDuration: string;
  revN: number;
  revAvg: string;
  revRejected: number;
  tkN: number;
  tkAvg: string;
  tkOpen: number;
  tkReopened: number;
  tDone: number;
  tOver: number;
  tOpen: number;
  csr: CsrRow[];
  comp: CompRow[];
  onboard: OnboardRow[];
  clientsN: number;
}

const hoursLabel = (h: number): string => (h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`);
const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Figures behind Reports & analytics, computed from the demo records for the chosen date range. */
export function buildAnalytics(data: DemoData, me: User, range: RangeKey): Analytics {
  const from = Date.now() - (range === "all" ? 100_000 : Number(range)) * DAY;
  const inRange = (t?: number): boolean => !!t && t >= from;
  const today = dISO(0);
  const projectOf = (cid: string) => data.projects.find((p) => p.client === cid);
  const scoped = data.projects.filter((p) => {
    const c = data.users.find((u) => u.id === p.client);
    return c && c.status !== "Removed" && can(me, "viewClient", c);
  });
  const clients = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed");
  const staffActive = data.users.filter((u) => u.role !== "CLIENT" && u.status === "Active");

  const doneProjects = scoped.filter((p) => p.completedAt && inRange(p.completedAt));
  const reviews = data.docs.filter((d) => d.reviewedAt && d.submittedAt && inRange(d.reviewedAt));
  const resolved = data.tickets.filter((t) => t.resolution?.at && inRange(t.resolution.at));
  const tDone = data.tasks.filter((t) => t.done && inRange(t.completedAt)).length;
  const monthsShown = range === "30" ? 3 : range === "90" ? 4 : 12;
  const pct = (n: number): number => (clients.length ? Math.round((n / clients.length) * 100) : 0);
  const withProject = (test: (stageIdx: number, done: boolean) => boolean) =>
    clients.filter((c) => {
      const p = projectOf(c.id);
      return p && test(p.stageIdx, isDone(p));
    }).length;

  return {
    stage: STAGES.map((st, i) => ({ label: st, n: scoped.filter((p) => p.stageIdx === i).length })).filter((x) => x.n > 0),
    status: CASE_STATUSES.map((st) => ({ label: st, n: scoped.filter((p) => p.status === st).length })),
    monthly: monthBuckets(monthsShown, (p) => p.completedAt ?? 0, scoped.filter((p) => p.completedAt)),
    completed: doneProjects.length,
    avgDuration: doneProjects.length
      ? `${Math.round(avg(doneProjects.map((p) => ((p.completedAt ?? 0) - p.createdAt) / DAY)))} days`
      : "—",
    revN: reviews.length,
    revAvg: reviews.length ? hoursLabel(avg(reviews.map((d) => ((d.reviewedAt ?? 0) - (d.submittedAt ?? 0)) / HOUR))) : "—",
    revRejected: reviews.filter((d) => d.status === "rejected" || d.status === "info").length,
    tkN: resolved.length,
    tkAvg: resolved.length ? hoursLabel(avg(resolved.map((t) => ((t.resolution?.at ?? 0) - t.createdAt) / HOUR))) : "—",
    tkOpen: data.tickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed").length,
    tkReopened: data.tickets.filter((t) => t.events.some((e) => e.note === "Client requested reopening")).length,
    tDone,
    tOver: data.tasks.filter((t) => !t.done && t.due && t.due < today).length,
    tOpen: data.tasks.filter((t) => !t.done).length,
    csr: staffActive
      .filter((u) => u.role === "CSR")
      .map((u) => ({
        id: u.id,
        name: u.name,
        clients: clients.filter((c) => c.csr === u.id).length,
        open: data.followups.filter((f) => f.csr === u.id && f.status === "Open").length,
        done: data.followups.filter((f) => f.csr === u.id && f.status === "Done" && inRange(f.doneAt)).length,
        inter: data.interactions.filter((i) => i.by === u.id && inRange(i.at)).length,
        tickets: data.tickets.filter((t) => t.handler === u.id && t.status !== "Resolved" && t.status !== "Closed").length,
      })),
    comp: staffActive
      .filter((u) => u.role === "COMPLIANCE")
      .map((u) => ({
        id: u.id,
        name: u.name,
        reviews: data.docs.filter((d) => d.reviewedBy === u.id && inRange(d.reviewedAt)).length,
        cases: data.projects.filter((p) => p.owner === u.id && !isDone(p)).length,
        tasks: data.tasks.filter((t) => t.assignee === u.id && !t.done).length,
        reports: data.reports.filter((r) => r.history.some((h) => h.by === u.id && inRange(h.at))).length,
      })),
    onboard: [
      { label: "Accepted invitation", n: clients.filter((c) => c.status === "Active").length },
      { label: "Case opened", n: withProject(() => true) },
      { label: "Documents under review or later", n: withProject((idx) => idx >= 4) },
      { label: "Formation completed", n: withProject((_, done) => done) },
    ].map((x) => ({ ...x, pct: pct(x.n) })),
    clientsN: clients.length,
  };
}
