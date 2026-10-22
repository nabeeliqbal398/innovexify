import { Injectable } from "@nestjs/common";
import type { FilingStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";
import { filingSelect, reminderSelect, type FilingRecord, type ReminderRecord } from "../interfaces/filings.interfaces";

type Db = Prisma.TransactionClient;

const caseSelect = {
  id: true,
  number: true,
  stage: true,
  deletedAt: true,
  client: { select: { id: true, name: true, clientProfile: { select: { caseNumber: true } } } },
} satisfies Prisma.CaseSelect;
export type CaseForFiling = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

/** All database access for filings and reminders. */
@Injectable()
export class FilingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    // Creating a filing holds the `filing` counter's row lock until commit, so keep the work short.
    return this.prisma.$transaction(work, { timeout: 20_000, maxWait: 15_000 });
  }

  async page(where: Prisma.FilingWhereInput, orderBy: Prisma.FilingOrderByWithRelationInput[], skip: number, take: number): Promise<[FilingRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.filing.findMany({ where, orderBy, skip, take, select: filingSelect }),
      this.prisma.filing.count({ where }),
    ]);
  }

  findOne(where: Prisma.FilingWhereInput, db: Db = this.prisma): Promise<FilingRecord | null> {
    return db.filing.findFirst({ where, select: filingSelect });
  }

  findById(id: string, db: Db = this.prisma): Promise<FilingRecord | null> {
    return db.filing.findUnique({ where: { id }, select: filingSelect });
  }

  findCase(where: Prisma.CaseWhereInput, db: Db = this.prisma): Promise<CaseForFiling | null> {
    return db.case.findFirst({ where, select: caseSelect });
  }

  create(data: Prisma.FilingUncheckedCreateInput, db: Db): Promise<{ id: string }> {
    return db.filing.create({ data, select: { id: true } });
  }

  /**
   * Updates only if the filing is still in the status the caller saw, so two people changing its status at once can't
   * both succeed on stale information. False when it moved meanwhile.
   */
  async updateIfStatus(id: string, expected: FilingStatus, data: Prisma.FilingUncheckedUpdateManyInput, db: Db): Promise<boolean> {
    const result = await db.filing.updateMany({ where: { id, status: expected }, data });
    return result.count === 1;
  }

  async reminderPage(caseId: string, skip: number, take: number): Promise<[ReminderRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.reminder.findMany({ where: { caseId }, orderBy: [{ date: "asc" }, { id: "asc" }], skip, take, select: reminderSelect }),
      this.prisma.reminder.count({ where: { caseId } }),
    ]);
  }

  createReminder(data: { caseId: string; title: string; date: Date; kind: string }, db: Db): Promise<ReminderRecord> {
    // `illustrative` is always true: nothing in the system issues legal deadlines.
    return db.reminder.create({ data: { ...data, illustrative: true }, select: reminderSelect });
  }

  findReminder(caseId: string, id: string, db: Db = this.prisma): Promise<ReminderRecord | null> {
    return db.reminder.findFirst({ where: { id, caseId }, select: reminderSelect });
  }

  async removeReminder(id: string, db: Db): Promise<void> {
    await db.reminder.delete({ where: { id } });
  }
}
