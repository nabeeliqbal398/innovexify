import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

type Db = Prisma.TransactionClient;

export const announcementSelect = {
  id: true,
  title: true,
  message: true,
  audienceId: true,
  priority: true,
  status: true,
  requireAck: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
  audience: { select: { id: true, name: true } },
} satisfies Prisma.AnnouncementSelect;
export type AnnouncementRecord = Prisma.AnnouncementGetPayload<{ select: typeof announcementSelect }>;

/** All database access for announcements. */
@Injectable()
export class AnnouncementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    // Publishing to every client writes one notification each, in one transaction.
    return this.prisma.$transaction(work, { timeout: 30_000 });
  }

  async page(where: Prisma.AnnouncementWhereInput, orderBy: Prisma.AnnouncementOrderByWithRelationInput[], skip: number, take: number): Promise<[AnnouncementRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.announcement.findMany({ where, orderBy, skip, take, select: announcementSelect }),
      this.prisma.announcement.count({ where }),
    ]);
  }

  findOne(where: Prisma.AnnouncementWhereInput, db: Db = this.prisma): Promise<AnnouncementRecord | null> {
    return db.announcement.findFirst({ where, select: announcementSelect });
  }

  findById(id: string, db: Db = this.prisma): Promise<AnnouncementRecord | null> {
    return db.announcement.findUnique({ where: { id }, select: announcementSelect });
  }

  create(data: Prisma.AnnouncementUncheckedCreateInput, db: Db): Promise<{ id: string }> {
    return db.announcement.create({ data, select: { id: true } });
  }

  /** Changes a row only if it is still in the status the caller saw. False when it moved meanwhile. */
  async updateIfStatus(id: string, expected: "DRAFT" | "PUBLISHED", data: Prisma.AnnouncementUncheckedUpdateManyInput, db: Db): Promise<boolean> {
    const result = await db.announcement.updateMany({ where: { id, status: expected }, data });
    return result.count === 1;
  }

  findClient(id: string, db: Db = this.prisma) {
    return db.user.findFirst({ where: { id, role: "CLIENT", deletedAt: null }, select: { id: true, name: true, status: true } });
  }

  activeClients(db: Db = this.prisma): Promise<Array<{ id: string; name: string; clientProfile: { caseNumber: string } | null }>> {
    return db.user.findMany({
      where: { role: "CLIENT", status: "ACTIVE", deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, clientProfile: { select: { caseNumber: true } } },
    });
  }

  activeClientCount(db: Db = this.prisma): Promise<number> {
    return db.user.count({ where: { role: "CLIENT", status: "ACTIVE", deletedAt: null } });
  }

  /** Acknowledgements (of active clients only) per announcement, in one query. */
  async ackCounts(announcementIds: string[]): Promise<Map<string, number>> {
    if (announcementIds.length === 0) return new Map();
    const rows = await this.prisma.announcementAck.groupBy({
      by: ["announcementId"],
      where: { announcementId: { in: announcementIds }, user: { status: "ACTIVE", deletedAt: null, role: "CLIENT" } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.announcementId, r._count._all]));
  }

  acksOf(announcementId: string, db: Db = this.prisma) {
    return db.announcementAck.findMany({ where: { announcementId }, select: { userId: true, at: true } });
  }

  ackOf(announcementId: string, userId: string, db: Db = this.prisma) {
    return db.announcementAck.findUnique({ where: { announcementId_userId: { announcementId, userId } }, select: { at: true } });
  }

  acksFor(userId: string, announcementIds: string[]): Promise<Array<{ announcementId: string; at: Date }>> {
    if (announcementIds.length === 0) return Promise.resolve([]);
    return this.prisma.announcementAck.findMany({ where: { userId, announcementId: { in: announcementIds } }, select: { announcementId: true, at: true } });
  }

  /** Records the acknowledgement. Returns true if this call created it, false if it already existed. */
  async acknowledge(announcementId: string, userId: string, db: Db): Promise<boolean> {
    const result = await db.announcementAck.createMany({ data: [{ announcementId, userId }], skipDuplicates: true });
    return result.count === 1;
  }
}
