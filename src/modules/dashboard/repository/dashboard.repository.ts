import { Injectable } from "@nestjs/common";
import { Prisma, type CaseStage, type CaseStatus } from "@prisma/client";

import { caseScope, clientScope, documentScope, followUpScope, reportScope, taskScope, ticketScope, type ScopeActor } from "../../../common/scope/scope";
import { caseInScope, taskInScope } from "../../../common/scope/scope-sql";
import { PrismaService } from "../../../prisma/prisma.service";
import type { Bucket } from "../dto/dashboard.dto";

const FINISHED: Prisma.CaseWhereInput = { OR: [{ stage: "COMPLETED" }, { status: "COMPLETED" }] };
const UNFINISHED: Prisma.CaseWhereInput = { NOT: FINISHED };
const OPEN_TICKET: Prisma.TicketWhereInput = { status: { notIn: ["RESOLVED", "CLOSED"] } };

/**
 * The dashboard's numbers, each one a COUNT or GROUP BY run in the database under the caller's data scope (the Prisma scope
 * helpers, or their SQL twins in common/scope/scope-sql.ts for the date-bucketed queries). No rows are loaded to be counted in code.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- cases -----------------------------------------------------------------------------------------------------

  clients(actor: ScopeActor, extra: Prisma.UserWhereInput = {}): Promise<number> {
    return this.prisma.user.count({ where: { AND: [{ role: "CLIENT" }, clientScope(actor), extra] } });
  }

  cases(actor: ScopeActor, where: Prisma.CaseWhereInput = {}): Promise<number> {
    return this.prisma.case.count({ where: { AND: [caseScope(actor), where] } });
  }

  activeCases(actor: ScopeActor, where: Prisma.CaseWhereInput = {}): Promise<number> {
    return this.cases(actor, { AND: [UNFINISHED, where] });
  }

  finishedCases(actor: ScopeActor): Promise<number> {
    return this.cases(actor, FINISHED);
  }

  async stageDistribution(actor: ScopeActor): Promise<Array<{ stage: CaseStage; count: number }>> {
    const rows = await this.prisma.case.groupBy({ by: ["stage"], where: caseScope(actor), _count: { _all: true } });
    return rows.map((r) => ({ stage: r.stage, count: r._count._all }));
  }

  async deadlineCases(actor: ScopeActor, until: Date, take: number): Promise<Array<{ id: string; number: number; deadline: Date; clientName: string }>> {
    const rows = await this.prisma.case.findMany({
      where: { AND: [caseScope(actor), UNFINISHED, { deadline: { not: null, lte: until } }] },
      orderBy: [{ deadline: "asc" }, { number: "asc" }],
      take,
      select: { id: true, number: true, deadline: true, client: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, number: r.number, deadline: r.deadline as Date, clientName: r.client.name }));
  }

  async latestCase(clientId: string): Promise<{ id: string; number: number; stage: CaseStage; status: CaseStatus } | null> {
    return this.prisma.case.findFirst({
      where: { AND: [{ clientId }, { deletedAt: null }] },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, stage: true, status: true },
    });
  }

  // ---- tasks -----------------------------------------------------------------------------------------------------

  tasks(actor: ScopeActor, where: Prisma.TaskWhereInput = {}): Promise<number> {
    return this.prisma.task.count({ where: { AND: [taskScope(actor), where] } });
  }

  deadlineTasks(actor: ScopeActor, until: Date, take: number): Promise<Array<{ id: string; title: string; due: Date }>> {
    return this.prisma.task.findMany({
      where: { AND: [taskScope(actor), { done: false, due: { lte: until } }] },
      orderBy: [{ due: "asc" }, { id: "asc" }],
      take,
      select: { id: true, title: true, due: true },
    });
  }

  // ---- documents, tickets, reports, follow-ups ---------------------------------------------------------------------

  documents(actor: ScopeActor, where: Prisma.DocumentWhereInput): Promise<number> {
    return this.prisma.document.count({ where: { AND: [documentScope(actor), where] } });
  }

  async documentsToReview(actor: ScopeActor, take: number): Promise<Array<{ id: string; name: string; clientName: string }>> {
    const rows = await this.prisma.document.findMany({
      where: { AND: [documentScope(actor), { status: "SUBMITTED" }] },
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      take,
      select: { id: true, name: true, client: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, clientName: r.client.name }));
  }

  tickets(actor: ScopeActor, where: Prisma.TicketWhereInput = {}): Promise<number> {
    return this.prisma.ticket.count({ where: { AND: [ticketScope(actor), where] } });
  }

  openTickets(actor: ScopeActor, where: Prisma.TicketWhereInput = {}): Promise<number> {
    return this.tickets(actor, { AND: [OPEN_TICKET, where] });
  }

  async ticketsNeedingAttention(actor: ScopeActor, take: number): Promise<Array<{ id: string; number: number; title: string; status: string; priority: string; clientName: string }>> {
    const rows = await this.prisma.ticket.findMany({
      where: { AND: [ticketScope(actor), OPEN_TICKET] },
      orderBy: [{ escalated: "desc" }, { priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      take,
      select: { id: true, number: true, title: true, status: true, priority: true, client: { select: { name: true } } },
    });
    return rows.map((r) => ({ ...r, clientName: r.client.name }));
  }

  reports(actor: ScopeActor, where: Prisma.ReportWhereInput = {}): Promise<number> {
    return this.prisma.report.count({ where: { AND: [reportScope(actor), where] } });
  }

  followUps(actor: ScopeActor, where: Prisma.FollowUpWhereInput): Promise<number> {
    return this.prisma.followUp.count({ where: { AND: [followUpScope(actor), where] } });
  }

  /** Filings with a next action due by `until` that are not yet approved, on cases the caller can see. */
  filingsDueSoon(actor: ScopeActor, until: Date): Promise<number> {
    return this.prisma.filing.count({
      where: { AND: [{ case: { is: caseScope(actor) } }, { nextActionDate: { not: null, lte: until } }, { status: { not: "APPROVED" } }] },
    });
  }

  async unassignedClients(actor: ScopeActor, take: number): Promise<Array<{ id: string; name: string; caseNumber: string }>> {
    const rows = await this.prisma.user.findMany({
      where: { AND: [{ role: "CLIENT" }, clientScope(actor), { clientProfile: { is: { csrId: null } } }] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: { id: true, name: true, clientProfile: { select: { caseNumber: true } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, caseNumber: r.clientProfile?.caseNumber ?? "" }));
  }

  /** The caller's clients that need a nudge: invited but not signed up, or with a document the client still owes. */
  async clientsToFollowUp(actor: ScopeActor, take: number): Promise<Array<{ id: string; name: string; invited: boolean }>> {
    const rows = await this.prisma.user.findMany({
      where: {
        AND: [
          { role: "CLIENT" },
          clientScope(actor),
          { OR: [{ status: "INVITED" }, { documents: { some: { status: { in: ["REQUESTED", "REJECTED"] }, deletedAt: null } } }] },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take,
      select: { id: true, name: true, status: true },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, invited: r.status === "INVITED" }));
  }

  unreadNotifications(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async recentReviews(actor: ScopeActor, take: number): Promise<Array<{ document: string; client: string; status: string; by: string | null; at: Date }>> {
    const rows = await this.prisma.documentEvent.findMany({
      where: { AND: [{ status: { in: ["APPROVED", "REJECTED", "INFO"] } }, { document: { is: documentScope(actor) } }] },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take,
      select: { status: true, at: true, by: { select: { name: true } }, document: { select: { name: true, client: { select: { name: true } } } } },
    });
    return rows.map((r) => ({ document: r.document.name, client: r.document.client.name, status: r.status, by: r.by.name, at: r.at }));
  }

  async recentActivity(take: number): Promise<Array<{ at: Date; actor: string | null; actorRole: Prisma.AuditLogGetPayload<object>["actorRole"]; action: string; target: string }>> {
    const rows = await this.prisma.auditLog.findMany({
      where: { ok: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { createdAt: true, actorRole: true, action: true, target: true, actor: { select: { name: true } } },
    });
    return rows.map((r) => ({ at: r.createdAt, actor: r.actor?.name ?? null, actorRole: r.actorRole, action: r.action, target: r.target }));
  }

  // ---- trends ------------------------------------------------------------------------------------------------------

  /** Cases completed per calendar month (UTC), the last `count` months including this one, oldest first, zeros included. */
  casesCompletedByMonth(actor: ScopeActor, count: number): Promise<Bucket[]> {
    return this.prisma.$queryRaw<Bucket[]>`
      SELECT to_char(m.month, 'YYYY-MM') AS label, count(c.id)::int AS count
      FROM generate_series(date_trunc('month', now() AT TIME ZONE 'UTC') - make_interval(months => ${count - 1}::int), date_trunc('month', now() AT TIME ZONE 'UTC'), interval '1 month') AS m(month)
      LEFT JOIN "Case" c ON date_trunc('month', c."completedAt") = m.month AND ${caseInScope(actor, "c")}
      GROUP BY m.month ORDER BY m.month`;
  }

  /** Cases completed per 7-day window ending with today, the last `count` windows, oldest first. A label is the window's first day. */
  casesCompletedByWeek(actor: ScopeActor, count: number): Promise<Bucket[]> {
    return this.prisma.$queryRaw<Bucket[]>`
      WITH bounds AS (SELECT date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day' AS e)
      SELECT to_char(bounds.e - (w.i + 1) * interval '7 days', 'YYYY-MM-DD') AS label, count(c.id)::int AS count
      FROM bounds CROSS JOIN generate_series(${count - 1}::int, 0, -1) AS w(i)
      LEFT JOIN "Case" c
        ON c."completedAt" >= bounds.e - (w.i + 1) * interval '7 days' AND c."completedAt" < bounds.e - w.i * interval '7 days' AND ${caseInScope(actor, "c")}
      GROUP BY w.i, bounds.e ORDER BY w.i DESC`;
  }

  tasksDoneByMonth(actor: ScopeActor, count: number): Promise<Bucket[]> {
    return this.prisma.$queryRaw<Bucket[]>`
      SELECT to_char(m.month, 'YYYY-MM') AS label, count(k.id)::int AS count
      FROM generate_series(date_trunc('month', now() AT TIME ZONE 'UTC') - make_interval(months => ${count - 1}::int), date_trunc('month', now() AT TIME ZONE 'UTC'), interval '1 month') AS m(month)
      LEFT JOIN (SELECT k.id, k."completedAt" FROM "Task" k JOIN "Case" c ON c.id = k."caseId" WHERE k.done = true AND ${taskInScope(actor, "k", "c")}) k
        ON date_trunc('month', k."completedAt") = m.month
      GROUP BY m.month ORDER BY m.month`;
  }

  tasksDoneByWeek(actor: ScopeActor, count: number): Promise<Bucket[]> {
    return this.prisma.$queryRaw<Bucket[]>`
      WITH bounds AS (SELECT date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day' AS e)
      SELECT to_char(bounds.e - (w.i + 1) * interval '7 days', 'YYYY-MM-DD') AS label, count(k.id)::int AS count
      FROM bounds CROSS JOIN generate_series(${count - 1}::int, 0, -1) AS w(i)
      LEFT JOIN (SELECT k.id, k."completedAt" FROM "Task" k JOIN "Case" c ON c.id = k."caseId" WHERE k.done = true AND ${taskInScope(actor, "k", "c")}) k
        ON k."completedAt" >= bounds.e - (w.i + 1) * interval '7 days' AND k."completedAt" < bounds.e - w.i * interval '7 days'
      GROUP BY w.i, bounds.e ORDER BY w.i DESC`;
  }
}
