import { Injectable } from "@nestjs/common";
import type { Prisma, ReportStatus, Role } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";
import { eventSelect, messageSelect, reportSelect, type EventRecord, type MessageRecord, type ReportRecord } from "../interfaces/reports.interfaces";

type Db = Prisma.TransactionClient;

/** All database access for CSR reports. */
@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    // Creating a report holds the `report` counter's row lock until commit.
    return this.prisma.$transaction(work, { timeout: 20_000, maxWait: 15_000 });
  }

  async page(where: Prisma.ReportWhereInput, orderBy: Prisma.ReportOrderByWithRelationInput[], skip: number, take: number): Promise<[ReportRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.report.findMany({ where, orderBy, skip, take, select: reportSelect }),
      this.prisma.report.count({ where }),
    ]);
  }

  findOne(where: Prisma.ReportWhereInput, db: Db = this.prisma): Promise<ReportRecord | null> {
    return db.report.findFirst({ where, select: reportSelect });
  }

  findById(id: string, db: Db = this.prisma): Promise<ReportRecord | null> {
    return db.report.findUnique({ where: { id }, select: reportSelect });
  }

  /** `includeNotes: false` is a database filter, so a CSR's query never even loads a Compliance-only note. */
  messages(reportId: string, includeNotes: boolean, db: Db = this.prisma): Promise<MessageRecord[]> {
    return db.reportMessage.findMany({
      where: { reportId, ...(includeNotes ? {} : { isNote: false }) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: messageSelect,
    });
  }

  events(reportId: string, db: Db = this.prisma): Promise<EventRecord[]> {
    return db.reportEvent.findMany({ where: { reportId }, orderBy: [{ at: "asc" }, { id: "asc" }], select: eventSelect });
  }

  findClient(where: Prisma.UserWhereInput, db: Db = this.prisma) {
    return db.user.findFirst({ where, select: { id: true, name: true, status: true, clientProfile: { select: { caseNumber: true, csrId: true } } } });
  }

  findCase(id: string, db: Db = this.prisma) {
    return db.case.findFirst({ where: { id, deletedAt: null }, select: { id: true, number: true, clientId: true } });
  }

  /** The client's current case: the newest one that isn't removed. */
  currentCaseOf(clientId: string, db: Db = this.prisma) {
    return db.case.findFirst({ where: { clientId, deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true } });
  }

  staffIds(roles: readonly Role[], db: Db = this.prisma): Promise<string[]> {
    return db.user.findMany({ where: { role: { in: [...roles] }, status: "ACTIVE", deletedAt: null }, select: { id: true } }).then((rows) => rows.map((r) => r.id));
  }

  create(data: Prisma.ReportUncheckedCreateInput, db: Db): Promise<{ id: string }> {
    return db.report.create({ data, select: { id: true } });
  }

  addEvent(data: { reportId: string; status: ReportStatus; byId: string }, db: Db) {
    return db.reportEvent.create({ data, select: { id: true } });
  }

  addMessage(data: { reportId: string; authorId: string; text: string; isNote: boolean }, db: Db): Promise<MessageRecord> {
    return db.reportMessage.create({ data, select: messageSelect });
  }

  /** Moves a report only if it is still in the status the caller saw. False when it moved meanwhile. */
  async moveIfStatus(id: string, expected: ReportStatus, next: ReportStatus, db: Db): Promise<boolean> {
    const result = await db.report.updateMany({ where: { id, status: expected }, data: { status: next } });
    return result.count === 1;
  }

  /** Marks activity on a report that is not resolved yet. False when it was resolved in the meantime. */
  async touchIfOpen(id: string, db: Db): Promise<boolean> {
    const result = await db.report.updateMany({ where: { id, status: { not: "REVIEWED" } }, data: { updatedAt: new Date() } });
    return result.count === 1;
  }
}
