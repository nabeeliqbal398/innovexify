import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { caseScope, taskScope, ticketScope, type ScopeActor } from "../../../common/scope/scope";
import { caseInScope, clientIdInScope } from "../../../common/scope/scope-sql";
import { PrismaService } from "../../../prisma/prisma.service";

/** Everything is computed in the database: group-bys through Prisma, the rest as raw SQL with the caller's scope in the WHERE. */
@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async casesByStage(actor: ScopeActor): Promise<Array<{ key: string; count: number }>> {
    const rows = await this.prisma.case.groupBy({ by: ["stage"], where: caseScope(actor), _count: { _all: true } });
    return rows.map((r) => ({ key: r.stage, count: r._count._all }));
  }

  async casesByStatus(actor: ScopeActor): Promise<Array<{ key: string; count: number }>> {
    const rows = await this.prisma.case.groupBy({ by: ["status"], where: caseScope(actor), _count: { _all: true } });
    return rows.map((r) => ({ key: r.status, count: r._count._all }));
  }

  /** Cases completed in [from, to): how many, and the average days from creation to completion. */
  async completedCases(actor: ScopeActor, from: Date, to: Date): Promise<{ count: number; avgDays: number | null }> {
    const rows = await this.prisma.$queryRaw<Array<{ count: number; avg_days: number | null }>>`
      SELECT count(*)::int AS count, avg(EXTRACT(EPOCH FROM (c."completedAt" - c."createdAt")) / 86400)::float8 AS avg_days
      FROM "Case" c
      WHERE c."completedAt" >= ${from} AND c."completedAt" < ${to} AND ${caseInScope(actor, "c")}`;
    return { count: rows[0]?.count ?? 0, avgDays: rows[0]?.avg_days ?? null };
  }

  /** One row per calendar month (UTC) from the month of `from` to the month of the last day, zeros included. */
  async completedByMonth(actor: ScopeActor, from: Date, to: Date): Promise<Array<{ month: string; count: number }>> {
    return this.prisma.$queryRaw<Array<{ month: string; count: number }>>`
      SELECT to_char(m.month, 'YYYY-MM') AS month, count(c.id)::int AS count
      FROM generate_series(date_trunc('month', ${from}::timestamp), date_trunc('month', ${to}::timestamp - interval '1 second'), interval '1 month') AS m(month)
      LEFT JOIN "Case" c
        ON date_trunc('month', c."completedAt") = m.month AND c."completedAt" >= ${from} AND c."completedAt" < ${to} AND ${caseInScope(actor, "c")}
      GROUP BY m.month
      ORDER BY m.month`;
  }

  /** Documents reviewed in [from, to) that had been submitted: how many, the average hours to review, how many were sent back. */
  async documentReviews(actor: ScopeActor, from: Date, to: Date): Promise<{ reviewed: number; avgHours: number | null; sentBack: number }> {
    const rows = await this.prisma.$queryRaw<Array<{ reviewed: number; avg_hours: number | null; sent_back: number }>>`
      SELECT count(*)::int AS reviewed,
             avg(EXTRACT(EPOCH FROM (d."reviewedAt" - d."submittedAt")) / 3600)::float8 AS avg_hours,
             count(*) FILTER (WHERE d.status IN ('rejected'::"DocStatus", 'info'::"DocStatus"))::int AS sent_back
      FROM "Document" d
      WHERE d."reviewedAt" >= ${from} AND d."reviewedAt" < ${to} AND d."submittedAt" IS NOT NULL
        AND d."deletedAt" IS NULL AND ${clientIdInScope(actor, Prisma.sql`d."clientId"`)}`;
    const row = rows[0];
    return { reviewed: row?.reviewed ?? 0, avgHours: row?.avg_hours ?? null, sentBack: row?.sent_back ?? 0 };
  }

  async resolvedTickets(actor: ScopeActor, from: Date, to: Date): Promise<{ resolved: number; avgHours: number | null }> {
    const rows = await this.prisma.$queryRaw<Array<{ resolved: number; avg_hours: number | null }>>`
      SELECT count(*)::int AS resolved, avg(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 3600)::float8 AS avg_hours
      FROM "Ticket" t
      WHERE t."resolvedAt" >= ${from} AND t."resolvedAt" < ${to} AND ${clientIdInScope(actor, Prisma.sql`t."clientId"`)}`;
    return { resolved: rows[0]?.resolved ?? 0, avgHours: rows[0]?.avg_hours ?? null };
  }

  openTickets(actor: ScopeActor): Promise<number> {
    return this.prisma.ticket.count({ where: { AND: [ticketScope(actor), { status: { notIn: ["RESOLVED", "CLOSED"] } }] } });
  }

  reopenedTickets(actor: ScopeActor, from: Date, to: Date): Promise<number> {
    return this.prisma.ticket.count({
      where: { AND: [ticketScope(actor), { events: { some: { note: "Client requested reopening", at: { gte: from, lt: to } } } }] },
    });
  }

  doneTasks(actor: ScopeActor, from: Date, to: Date): Promise<number> {
    return this.prisma.task.count({ where: { AND: [taskScope(actor), { done: true, completedAt: { gte: from, lt: to } }] } });
  }

  openTasks(actor: ScopeActor): Promise<number> {
    return this.prisma.task.count({ where: { AND: [taskScope(actor), { done: false }] } });
  }

  overdueTasks(actor: ScopeActor, today: Date): Promise<number> {
    return this.prisma.task.count({ where: { AND: [taskScope(actor), { done: false, due: { lt: today } }] } });
  }

  activeStaff(role: "CSR" | "COMPLIANCE"): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.user.findMany({ where: { role, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  }

  /** Per-CSR counts, keyed by user id. */
  async csrFigures(from: Date, to: Date): Promise<Map<string, { clients: number; openFollowUps: number; followUpsDone: number; interactions: number; openTickets: number }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; clients: number; open_follow_ups: number; follow_ups_done: number; interactions: number; open_tickets: number }>
    >`
      SELECT u.id,
        (SELECT count(*)::int FROM "ClientProfile" cp JOIN "User" cu ON cu.id = cp."userId" WHERE cp."csrId" = u.id AND cu."deletedAt" IS NULL) AS clients,
        (SELECT count(*)::int FROM "FollowUp" f WHERE f."csrId" = u.id AND f.status = 'Open'::"FollowUpStatus") AS open_follow_ups,
        (SELECT count(*)::int FROM "FollowUp" f WHERE f."csrId" = u.id AND f.status = 'Done'::"FollowUpStatus" AND f."doneAt" >= ${from} AND f."doneAt" < ${to}) AS follow_ups_done,
        (SELECT count(*)::int FROM "Interaction" i WHERE i."byId" = u.id AND i."at" >= ${from} AND i."at" < ${to}) AS interactions,
        (SELECT count(*)::int FROM "Ticket" t WHERE t."handlerId" = u.id AND t.status NOT IN ('Resolved'::"TicketStatus", 'Closed'::"TicketStatus")) AS open_tickets
      FROM "User" u
      WHERE u.role = 'CSR'::"Role" AND u.status = 'Active'::"UserStatus" AND u."deletedAt" IS NULL`;
    return new Map(
      rows.map((r) => [r.id, { clients: r.clients, openFollowUps: r.open_follow_ups, followUpsDone: r.follow_ups_done, interactions: r.interactions, openTickets: r.open_tickets }]),
    );
  }

  /** Per-Compliance counts, keyed by user id. A case is finished when its stage or its status is Completed. */
  async complianceFigures(from: Date, to: Date): Promise<Map<string, { reviews: number; ownedCases: number; openTasks: number; reportsTouched: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; reviews: number; owned_cases: number; open_tasks: number; reports_touched: number }>>`
      SELECT u.id,
        (SELECT count(*)::int FROM "Document" d WHERE d."reviewedById" = u.id AND d."reviewedAt" >= ${from} AND d."reviewedAt" < ${to}) AS reviews,
        (SELECT count(*)::int FROM "Case" c WHERE c."ownerId" = u.id AND c."deletedAt" IS NULL AND c.stage <> 'Completed'::"CaseStage" AND c.status <> 'Completed'::"CaseStatus") AS owned_cases,
        (SELECT count(*)::int FROM "Task" k WHERE k."assigneeId" = u.id AND k.done = false) AS open_tasks,
        (SELECT count(DISTINCT e."reportId")::int FROM "ReportEvent" e WHERE e."byId" = u.id AND e."at" >= ${from} AND e."at" < ${to}) AS reports_touched
      FROM "User" u
      WHERE u.role = 'COMPLIANCE'::"Role" AND u.status = 'Active'::"UserStatus" AND u."deletedAt" IS NULL`;
    return new Map(rows.map((r) => [r.id, { reviews: r.reviews, ownedCases: r.owned_cases, openTasks: r.open_tasks, reportsTouched: r.reports_touched }]));
  }

  /** How far clients got: the clients in scope, and how many reached each step. */
  async onboarding(actor: ScopeActor): Promise<{ clients: number; accepted: number; caseOpened: number; reviewOrLater: number; completed: number }> {
    const rows = await this.prisma.$queryRaw<Array<{ clients: number; accepted: number; case_opened: number; review_or_later: number; completed: number }>>`
      SELECT count(*)::int AS clients,
        count(*) FILTER (WHERE u.status = 'Active'::"UserStatus")::int AS accepted,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Case" c WHERE c."clientId" = u.id AND c."deletedAt" IS NULL))::int AS case_opened,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Case" c WHERE c."clientId" = u.id AND c."deletedAt" IS NULL AND c.stage >= 'Documents Under Review'::"CaseStage"))::int AS review_or_later,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Case" c WHERE c."clientId" = u.id AND c."deletedAt" IS NULL AND (c.stage = 'Completed'::"CaseStage" OR c.status = 'Completed'::"CaseStatus")))::int AS completed
      FROM "User" u
      WHERE u.role = 'CLIENT'::"Role" AND u."deletedAt" IS NULL AND ${clientIdInScope(actor, Prisma.sql`u.id`)}`;
    const row = rows[0];
    return { clients: row?.clients ?? 0, accepted: row?.accepted ?? 0, caseOpened: row?.case_opened ?? 0, reviewOrLater: row?.review_or_later ?? 0, completed: row?.completed ?? 0 };
  }
}
