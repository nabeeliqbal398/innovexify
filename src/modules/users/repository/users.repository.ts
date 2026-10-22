import { Injectable } from "@nestjs/common";
import type { NotificationCategory, Prisma, Role } from "@prisma/client";

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
}
