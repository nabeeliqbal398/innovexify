import { Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/interfaces/actor-context";
import { addDays, isoDay, todayUtc } from "../../../common/utils/dates";
import { AnalyticsRepository } from "../../analytics/repository/analytics.repository";
import { MessagesService } from "../../messages/service/messages.service";
import type { AttentionItem, DashboardOverview, DeadlineItem, Kpi, WorkloadRow } from "../dto/dashboard.dto";
import { DashboardRepository } from "../repository/dashboard.repository";

const MONTHS = 6;
const WEEKS = 8;
const DEADLINE_CASE_DAYS = 14;
const DEADLINE_TASK_DAYS = 7;
const DEADLINE_ITEMS = 8;

const kpi = (key: string, value: number, detail?: number): Kpi => (detail === undefined ? { key, value } : { key, value, detail });
const daysBetween = (date: Date, today: Date): number => Math.round((date.getTime() - today.getTime()) / 86_400_000);

/**
 * The overview each role lands on. One shape for every role (`role`, `kpis`, plus the sections that role has), so the screen
 * reads what is present. Everything is counted under the caller's data scope, so a CSR's numbers are about their own
 * clients and a client's about themselves. The server returns numbers and ids; wording and links are the screen's.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly repo: DashboardRepository,
    private readonly analytics: AnalyticsRepository,
    private readonly messages: MessagesService,
  ) {}

  /**
   * The number on each navigation item, keyed by the view's name. A view the caller's role does not have counts 0.
   * Messages are unread messages in the conversations they can see (`cmsgs` is the client's own thread).
   */
  async navCounts(c: ActorContext): Promise<Record<"messages" | "cmsgs" | "documents" | "tickets" | "reports" | "followups" | "tasks", number>> {
    const a = { id: c.actor.id, role: c.actor.role };
    const today = todayUtc();
    const role = c.actor.role;
    const isClient = role === "CLIENT";
    const seesTasks = role === "ADMIN" || role === "MANAGER";
    const seesFollowUps = seesTasks || role === "CSR";
    const [unread, documents, tickets, reports, followups, tasks] = await Promise.all([
      this.messages.unreadCount(c),
      isClient ? Promise.resolve(0) : this.repo.documents(a, { status: "SUBMITTED" }),
      isClient ? Promise.resolve(0) : this.repo.openTickets(a),
      role === "COMPLIANCE" ? this.repo.reports(a, { status: "SUBMITTED" }) : Promise.resolve(0),
      seesFollowUps ? this.repo.followUps(a, { status: "OPEN", due: { lte: today } }) : Promise.resolve(0),
      seesTasks ? this.repo.tasks(a, { done: false, due: { lt: today } }) : Promise.resolve(0),
    ]);
    return { messages: isClient ? 0 : unread.unread, cmsgs: isClient ? unread.unread : 0, documents, tickets, reports, followups, tasks };
  }

  async overview(c: ActorContext): Promise<DashboardOverview> {
    const base = { role: c.actor.role, generatedAt: new Date().toISOString() };
    switch (c.actor.role) {
      case "ADMIN":
      case "MANAGER":
        return { ...base, ...(await this.business(c)) };
      case "CSR":
        return { ...base, ...(await this.csr(c)) };
      case "COMPLIANCE":
        return { ...base, ...(await this.compliance(c)) };
      default:
        return { ...base, ...(await this.client(c)) };
    }
  }

  private async business(c: ActorContext): Promise<Pick<DashboardOverview, "kpis" | "stageDistribution" | "trends" | "deadlines" | "workload" | "needsAttention" | "activity">> {
    const a = { id: c.actor.id, role: c.actor.role };
    const today = todayUtc();
    const isAdmin = c.actor.role === "ADMIN";
    const [
      clients,
      active,
      awaitingClient,
      underReview,
      stateFilings,
      completed,
      openTasks,
      overdueTasks,
      pendingReviews,
      openTickets,
      escalated,
      reportsTotal,
      reportsSubmitted,
      stageDistribution,
      casesByMonth,
      casesByWeek,
      tasksByMonth,
      tasksByWeek,
      deadlineCases,
      deadlineTasks,
      csrs,
      comps,
      csrFigures,
      compFigures,
      unassigned,
      toReview,
      tickets,
      activity,
    ] = await Promise.all([
      this.repo.clients(a),
      this.repo.activeCases(a),
      this.repo.activeCases(a, { OR: [{ stage: { in: ["INFORMATION_REQUIRED", "DOCUMENTS_PENDING"] } }, { status: "AWAITING_CLIENT" }] }),
      this.repo.activeCases(a, { stage: "DOCUMENTS_UNDER_REVIEW" }),
      this.repo.activeCases(a, { stage: "STATE_FILING_IN_PROGRESS" }),
      this.repo.finishedCases(a),
      this.repo.tasks(a, { done: false }),
      this.repo.tasks(a, { done: false, due: { lt: today } }),
      this.repo.documents(a, { status: "SUBMITTED" }),
      this.repo.openTickets(a),
      this.repo.openTickets(a, { OR: [{ escalated: true }, { priority: { in: ["HIGH", "URGENT"] } }] }),
      this.repo.reports(a),
      this.repo.reports(a, { status: "SUBMITTED" }),
      this.repo.stageDistribution(a),
      this.repo.casesCompletedByMonth(a, MONTHS),
      this.repo.casesCompletedByWeek(a, WEEKS),
      this.repo.tasksDoneByMonth(a, MONTHS),
      this.repo.tasksDoneByWeek(a, WEEKS),
      this.repo.deadlineCases(a, addDays(today, DEADLINE_CASE_DAYS), DEADLINE_ITEMS),
      this.repo.deadlineTasks(a, addDays(today, DEADLINE_TASK_DAYS), DEADLINE_ITEMS),
      this.analytics.activeStaff("CSR"),
      this.analytics.activeStaff("COMPLIANCE"),
      this.analytics.csrFigures(addDays(today, -30), addDays(today, 1)),
      this.analytics.complianceFigures(addDays(today, -30), addDays(today, 1)),
      this.repo.unassignedClients(a, 5),
      this.repo.documentsToReview(a, 3),
      this.repo.ticketsNeedingAttention(a, 3),
      isAdmin ? this.repo.recentActivity(7) : Promise.resolve(undefined),
    ]);

    const kpis = [
      kpi("totalClients", clients, active),
      kpi("awaitingClientInformation", awaitingClient),
      kpi("underComplianceReview", underReview),
      kpi("stateFilingsInProgress", stateFilings),
      kpi("completedFormations", completed),
      kpi("openTasks", openTasks, overdueTasks),
      kpi("pendingDocumentReviews", pendingReviews),
      kpi("openTickets", openTickets, escalated),
      ...(isAdmin ? [] : [kpi("complianceReports", reportsTotal, reportsSubmitted)]),
    ];

    const deadlines: DeadlineItem[] = [
      ...deadlineCases.map((x): DeadlineItem => ({ kind: "case", id: x.id, title: `PRJ-${x.number} target date · ${x.clientName}`, date: isoDay(x.deadline) as string, daysFromToday: daysBetween(x.deadline, today) })),
      ...deadlineTasks.map((x): DeadlineItem => ({ kind: "task", id: x.id, title: x.title, date: isoDay(x.due) as string, daysFromToday: daysBetween(x.due, today) })),
    ]
      .sort((p, q) => (p.date === q.date ? p.id.localeCompare(q.id) : p.date < q.date ? -1 : 1))
      .slice(0, DEADLINE_ITEMS);

    const row = (id: string, name: string, part: Partial<WorkloadRow>): WorkloadRow => ({
      id,
      name,
      clients: 0,
      openFollowUps: 0,
      openTickets: 0,
      ownedCases: 0,
      openTasks: 0,
      reviewsLast30Days: 0,
      load: 0,
      ...part,
    });
    const csrRows = csrs.map((u) => {
      const f = csrFigures.get(u.id);
      const clientsN = f?.clients ?? 0;
      const followUps = f?.openFollowUps ?? 0;
      const ticketsN = f?.openTickets ?? 0;
      return row(u.id, u.name, { clients: clientsN, openFollowUps: followUps, openTickets: ticketsN, load: Math.min(100, clientsN * 12 + followUps * 8 + ticketsN * 10) });
    });
    const compRows = comps.map((u) => {
      const f = compFigures.get(u.id);
      const owned = f?.ownedCases ?? 0;
      const tasksN = f?.openTasks ?? 0;
      return row(u.id, u.name, { ownedCases: owned, openTasks: tasksN, reviewsLast30Days: f?.reviews ?? 0, load: Math.min(100, owned * 14 + tasksN * 10) });
    });

    const needsAttention: AttentionItem[] = [
      ...unassigned.map((u): AttentionItem => ({ kind: "unassignedClient", id: u.id, title: `${u.name} has no CSR`, detail: u.caseNumber })),
      ...toReview.map((d): AttentionItem => ({ kind: "documentToReview", id: d.id, title: d.name, detail: d.clientName })),
      ...tickets.map((t): AttentionItem => ({ kind: "ticket", id: t.id, title: `TKT-${t.number} · ${t.title}`, detail: `${t.clientName} · ${t.status}` })),
    ];

    return {
      kpis,
      stageDistribution: stageDistribution.sort((p, q) => p.stage.localeCompare(q.stage)),
      trends: { casesCompletedByMonth: casesByMonth, casesCompletedByWeek: casesByWeek, tasksDoneByMonth: tasksByMonth, tasksDoneByWeek: tasksByWeek },
      deadlines,
      workload: { csrs: csrRows, compliance: compRows },
      needsAttention,
      ...(activity ? { activity } : {}),
    };
  }

  private async csr(c: ActorContext): Promise<Pick<DashboardOverview, "kpis" | "needsAttention">> {
    const a = { id: c.actor.id, role: c.actor.role };
    const today = todayUtc();
    const [clients, invited, active, dueToday, overdue, docsOwed, ticketsWaiting, openTickets, doneRecently, toFollowUp] = await Promise.all([
      this.repo.clients(a),
      this.repo.clients(a, { status: "INVITED" }),
      this.repo.activeCases(a),
      this.repo.followUps(a, { status: "OPEN", due: { lte: today } }),
      this.repo.followUps(a, { status: "OPEN", due: { lt: today } }),
      this.repo.documents(a, { status: { in: ["REQUESTED", "REJECTED", "INFO"] } }),
      this.repo.tickets(a, { status: "WAITING_FOR_CLIENT" }),
      this.repo.openTickets(a),
      this.repo.followUps(a, { status: "DONE", doneAt: { gte: addDays(today, -30) } }),
      this.repo.clientsToFollowUp(a, 8),
    ]);
    return {
      kpis: [
        kpi("assignedClients", clients, invited),
        kpi("activeCases", active),
        kpi("followUpsDue", dueToday, overdue),
        kpi("pendingClientResponses", docsOwed + ticketsWaiting),
        kpi("openTickets", openTickets),
        kpi("followUpsCompletedLast30Days", doneRecently),
      ],
      needsAttention: toFollowUp.map((u): AttentionItem => ({ kind: "clientToFollowUp", id: u.id, title: u.name, detail: u.invited ? "invitation pending" : "document owed" })),
    };
  }

  private async compliance(c: ActorContext): Promise<Pick<DashboardOverview, "kpis" | "needsAttention" | "recentReviews">> {
    const a = { id: c.actor.id, role: c.actor.role };
    const today = todayUtc();
    const soon = addDays(today, DEADLINE_CASE_DAYS);
    const [awaiting, corrections, caseDeadlines, filingDeadlines, blocked, milestones, highPriority, reportsWaiting, toReview, recentReviews] = await Promise.all([
      this.repo.documents(a, { status: "SUBMITTED" }),
      this.repo.documents(a, { status: { in: ["REJECTED", "INFO"] } }),
      this.repo.activeCases(a, { deadline: { not: null, lte: soon } }),
      this.repo.filingsDueSoon(a, soon),
      this.repo.activeCases(a, { OR: [{ status: "BLOCKED" }, { stage: "INFORMATION_REQUIRED" }] }),
      this.repo.activeCases(a, { stage: { in: ["DOCUMENTS_PENDING", "DOCUMENTS_UNDER_REVIEW", "READY_FOR_FILING"] } }),
      this.repo.activeCases(a, { priority: { in: ["HIGH", "URGENT"] } }),
      this.repo.reports(a, { status: "SUBMITTED" }),
      this.repo.documentsToReview(a, 5),
      this.repo.recentReviews(a, 6),
    ]);
    return {
      kpis: [
        kpi("documentsAwaitingReview", awaiting),
        kpi("documentsNeedingCorrection", corrections),
        kpi("upcomingComplianceDeadlines", caseDeadlines + filingDeadlines),
        kpi("blockedByMissingInformation", blocked),
        kpi("activeComplianceMilestones", milestones),
        kpi("highPriorityCases", highPriority),
        kpi("reportsAwaitingReview", reportsWaiting),
      ],
      needsAttention: toReview.map((d): AttentionItem => ({ kind: "documentToReview", id: d.id, title: d.name, detail: d.clientName })),
      recentReviews,
    };
  }

  private async client(c: ActorContext): Promise<Pick<DashboardOverview, "kpis" | "case">> {
    const a = { id: c.actor.id, role: c.actor.role };
    const [latest, owed, openTickets, unread] = await Promise.all([
      this.repo.latestCase(c.actor.id),
      this.repo.documents(a, { status: { in: ["REQUESTED", "REJECTED", "INFO"] } }),
      this.repo.openTickets(a),
      this.repo.unreadNotifications(c.actor.id),
    ]);
    return { kpis: [kpi("documentsNeedingAction", owed), kpi("openTickets", openTickets), kpi("unreadNotifications", unread)], case: latest };
  }
}
