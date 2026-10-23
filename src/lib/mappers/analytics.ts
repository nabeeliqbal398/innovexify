import { CASE_STATUSES, STAGES } from "@/constants/vocab";
import type { Analytics } from "@/components/features/analytics/analytics-model";
import { CASE_STAGE, CASE_STATUS } from "./enums";

/** `GET /analytics`. Averages and percentages are null when nothing is behind them. */
export interface ApiAnalytics {
  range: { from: string; to: string };
  cases: {
    byStage: Array<{ key: string; count: number }>;
    byStatus: Array<{ key: string; count: number }>;
    completed: number;
    averageDaysToComplete: number | null;
    completedByMonth: Array<{ month: string; count: number }>;
  };
  documentReviews: { reviewed: number; averageHoursToReview: number | null; sentBack: number; sentBackRate: number | null };
  tickets: { resolved: number; averageHoursToResolve: number | null; open: number; reopened: number };
  tasks: { done: number; open: number; overdue: number };
  csrs: Array<{ id: string; name: string; clients: number; openFollowUps: number; followUpsDone: number; interactions: number; openTickets: number }>;
  compliance: Array<{ id: string; name: string; reviewsDone?: number; reviews: number; ownedCases: number; openTasks: number; reportsTouched: number }>;
  onboarding: { clients: number; steps: Array<{ key: string; count: number; percent: number | null }> };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ONBOARDING_LABEL: Record<string, string> = {
  acceptedInvitation: "Accepted invitation",
  caseOpened: "Case opened",
  documentsUnderReviewOrLater: "Documents under review or later",
  formationCompleted: "Formation completed",
};

/** "12 h", or "1.5 days" from 48 hours; "—" when there is nothing to average. */
export function hoursLabel(hours: number | null): string {
  if (hours === null) return "—";
  return hours < 48 ? `${Math.round(hours)} h` : `${(hours / 24).toFixed(1)} days`;
}

export function mapAnalytics(a: ApiAnalytics): Analytics {
  const statusCounts = new Map(a.cases.byStatus.map((s) => [CASE_STATUS.toLabel(s.key), s.count]));
  const stageCounts = new Map(a.cases.byStage.map((s) => [CASE_STAGE.toLabel(s.key), s.count]));
  return {
    stage: STAGES.map((label) => ({ label, n: stageCounts.get(label) ?? 0 })).filter((x) => x.n > 0),
    status: CASE_STATUSES.map((label) => ({ label, n: statusCounts.get(label) ?? 0 })),
    monthly: a.cases.completedByMonth.map((m) => ({ label: MONTHS[Number(m.month.slice(5, 7)) - 1] ?? m.month, n: m.count })),
    completed: a.cases.completed,
    avgDuration: a.cases.averageDaysToComplete === null ? "—" : `${Math.round(a.cases.averageDaysToComplete)} days`,
    revN: a.documentReviews.reviewed,
    revAvg: hoursLabel(a.documentReviews.averageHoursToReview),
    revRejected: a.documentReviews.sentBack,
    tkN: a.tickets.resolved,
    tkAvg: hoursLabel(a.tickets.averageHoursToResolve),
    tkOpen: a.tickets.open,
    tkReopened: a.tickets.reopened,
    tDone: a.tasks.done,
    tOver: a.tasks.overdue,
    tOpen: a.tasks.open,
    csr: a.csrs.map((r) => ({ id: r.id, name: r.name, clients: r.clients, open: r.openFollowUps, done: r.followUpsDone, inter: r.interactions, tickets: r.openTickets })),
    comp: a.compliance.map((r) => ({ id: r.id, name: r.name, reviews: r.reviews, cases: r.ownedCases, tasks: r.openTasks, reports: r.reportsTouched })),
    // No clients means no percentage: shown as 0 on the bar, with the count beside it.
    onboard: a.onboarding.steps.map((s) => ({ label: ONBOARDING_LABEL[s.key] ?? s.key, n: s.count, pct: s.percent ?? 0 })),
    clientsN: a.onboarding.clients,
  };
}
