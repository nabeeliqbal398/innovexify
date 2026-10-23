import type { CaseStage, CaseStatus, Role } from "@prisma/client";

/** One tile. `value` is always a number; the screen words it. `detail` is the second figure the tile shows (such as the overdue part), when it has one. */
export interface Kpi {
  key: string;
  value: number;
  detail?: number;
}

export interface Bucket {
  /** `YYYY-MM` for a month, the first day `YYYY-MM-DD` for a 7-day window. */
  label: string;
  count: number;
}

export interface DeadlineItem {
  kind: "case" | "task";
  id: string;
  title: string;
  date: string;
  daysFromToday: number;
}

export interface WorkloadRow {
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

export interface AttentionItem {
  kind: "unassignedClient" | "documentToReview" | "ticket" | "clientToFollowUp" | "report";
  id: string;
  title: string;
  detail: string;
}

export interface ActivityItem {
  at: Date;
  actor: string | null;
  actorRole: Role | null;
  action: string;
  target: string;
}

export interface ReviewItem {
  document: string;
  client: string;
  status: string;
  by: string | null;
  at: Date;
}

export interface DashboardOverview {
  role: Role;
  generatedAt: string;
  kpis: Kpi[];
  /** Admin and Manager. */
  stageDistribution?: Array<{ stage: CaseStage; count: number }>;
  /** Admin and Manager: cases completed and tasks done, per month (last 6) and per 7-day window (last 8). */
  trends?: { casesCompletedByMonth: Bucket[]; casesCompletedByWeek: Bucket[]; tasksDoneByMonth: Bucket[]; tasksDoneByWeek: Bucket[] };
  deadlines?: DeadlineItem[];
  /** Admin and Manager. */
  workload?: { csrs: WorkloadRow[]; compliance: WorkloadRow[] };
  needsAttention?: AttentionItem[];
  /** Admin only: the audit log is Admin's, so its recent entries are too. */
  activity?: ActivityItem[];
  /** Compliance. */
  recentReviews?: ReviewItem[];
  /** A client's own case. */
  case?: { id: string; number: number; stage: CaseStage; status: CaseStatus } | null;
}
