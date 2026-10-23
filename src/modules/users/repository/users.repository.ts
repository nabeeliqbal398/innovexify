import { Injectable } from "@nestjs/common";
import { Prisma, type NotificationCategory, type Role } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";
import { userSelect, type ReassignmentLoad, type UserRecord } from "../interfaces/users.interfaces";

type Db = Prisma.TransactionClient;

/** All database access for the users module. Services hold the rules; this holds the queries. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, { timeout: 15_000 });
  }

  async page(where: Prisma.UserWhereInput, orderBy: Prisma.UserOrderByWithRelationInput[], skip: number, take: number): Promise<[UserRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy, skip, take, select: userSelect }),
      this.prisma.user.count({ where }),
    ]);
  }

  findOne(where: Prisma.UserWhereInput, db: Db = this.prisma): Promise<UserRecord | null> {
    return db.user.findFirst({ where, select: userSelect });
  }

  /** An account that still holds this email: anything not removed. Case-insensitive. */
  findHoldingEmail(email: string, db: Db = this.prisma): Promise<{ id: string } | null> {
    return db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, status: { not: "REMOVED" } }, select: { id: true } });
  }

  create(data: { email: string; name: string; role: Role; invitedById: string }, db: Db): Promise<UserRecord> {
    return db.user.create({ data: { ...data, status: "INVITED" }, select: userSelect });
  }

  update(id: string, data: Prisma.UserUncheckedUpdateInput, db: Db): Promise<UserRecord> {
    return db.user.update({ where: { id }, data, select: userSelect });
  }

  /**
   * Locks every active Admin row until the transaction ends, then counts the active Admins other than `excludeId`.
   * The lock is what makes "never the last Admin" hold when two Admins suspend or remove each other at once:
   * the second request waits for the first to commit and then sees the true count.
   */
  async countOtherActiveAdmins(excludeId: string, db: Db): Promise<number> {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User" WHERE role = 'ADMIN' AND status = 'Active' AND "deletedAt" IS NULL ORDER BY id FOR UPDATE`;
    return rows.filter((r) => r.id !== excludeId).length;
  }

  async reassignmentLoad(csrId: string, db: Db): Promise<ReassignmentLoad> {
    const [clients, openTasks] = await Promise.all([
      db.clientProfile.count({ where: { csrId, user: { deletedAt: null, status: { not: "REMOVED" } } } }),
      db.task.count({ where: { assigneeId: csrId, done: false } }),
    ]);
    return { clients, openTasks };
  }

  /** Ends every session of the user. Their access token stops working at once too: JwtAuthGuard checks status per request. */
  async revokeSessions(userId: string, db: Db): Promise<number> {
    const result = await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return result.count;
  }

  /** Makes every unused invitation link stop working. */
  async expireInvitations(userId: string, db: Db): Promise<void> {
    await db.invitationToken.updateMany({ where: { userId, usedAt: null }, data: { expiresAt: new Date() } });
  }

  async markRemoved(userId: string, db: Db): Promise<UserRecord> {
    return db.user.update({ where: { id: userId }, data: { status: "REMOVED", deletedAt: new Date() }, select: userSelect });
  }

  /** A removed client's cases go with them: hidden everywhere except to Admin and Manager, and read-only. */
  async softDeleteCasesOf(clientId: string, db: Db): Promise<number> {
    const result = await db.case.updateMany({ where: { clientId, deletedAt: null }, data: { deletedAt: new Date(), version: { increment: 1 } } });
    return result.count;
  }

  preferencesOf(userId: string, db: Db = this.prisma) {
    return db.notificationPreference.findMany({ where: { userId }, select: { category: true, email: true, inApp: true } });
  }

  async upsertPreference(userId: string, category: NotificationCategory, change: { email?: boolean; inApp?: boolean }, db: Db): Promise<void> {
    await db.notificationPreference.upsert({
      where: { userId_category: { userId, category } },
      update: change,
      create: { userId, category, email: change.email ?? true, inApp: change.inApp ?? true },
    });
  }

  /** Active staff, by name: the few fields a picker needs. */
  directory(roles: Role[]): Promise<Array<{ id: string; name: string; role: Role }>> {
    return this.prisma.user.findMany({
      where: { role: { in: roles }, status: "ACTIVE", deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 500,
      select: { id: true, name: true, role: true },
    });
  }

  /** What the staff directory shows beside each person, for the people on one page: workload and the latest allowed action. */
  async staffExtras(ids: readonly string[], today: Date): Promise<Map<string, StaffExtras>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; last_activity: Date | null; clients: number; cases: number; tasks: number; overdue: number; follow_ups: number; tickets: number; reviews: number }>
    >`
      SELECT u.id,
        (SELECT max(a."createdAt") FROM "AuditLog" a WHERE a."actorId" = u.id AND a.ok) AS last_activity,
        (SELECT count(*)::int FROM "ClientProfile" cp JOIN "User" cu ON cu.id = cp."userId" WHERE cp."csrId" = u.id AND cu."deletedAt" IS NULL) AS clients,
        (SELECT count(*)::int FROM "Case" c
           WHERE c."deletedAt" IS NULL AND c.stage <> 'Completed'::"CaseStage" AND c.status <> 'Completed'::"CaseStatus"
             AND (c."ownerId" = u.id OR EXISTS (SELECT 1 FROM "ClientProfile" cp WHERE cp."userId" = c."clientId" AND cp."csrId" = u.id))) AS cases,
        (SELECT count(*)::int FROM "Task" k WHERE k."assigneeId" = u.id AND k.done = false) AS tasks,
        (SELECT count(*)::int FROM "Task" k WHERE k."assigneeId" = u.id AND k.done = false AND k.due < ${today}) AS overdue,
        (SELECT count(*)::int FROM "FollowUp" f WHERE f."csrId" = u.id AND f.status = 'Open'::"FollowUpStatus") AS follow_ups,
        (SELECT count(*)::int FROM "Ticket" t WHERE t."handlerId" = u.id AND t.status NOT IN ('Resolved'::"TicketStatus", 'Closed'::"TicketStatus")) AS tickets,
        (SELECT count(*)::int FROM "Document" d WHERE d."reviewedById" = u.id AND d."reviewedAt" > now() - interval '30 days') AS reviews
      FROM "User" u WHERE u.id IN (${Prisma.join(ids)})`;
    return new Map(
      rows.map((r) => [
        r.id,
        {
          lastActivityAt: r.last_activity,
          workload: { clients: r.clients, cases: r.cases, openTasks: r.tasks, overdueTasks: r.overdue, openFollowUps: r.follow_ups, openTickets: r.tickets, reviewsLast30Days: r.reviews },
        },
      ]),
    );
  }
}

export interface StaffExtras {
  lastActivityAt: Date | null;
  workload: { clients: number; cases: number; openTasks: number; overdueTasks: number; openFollowUps: number; openTickets: number; reviewsLast30Days: number };
}
