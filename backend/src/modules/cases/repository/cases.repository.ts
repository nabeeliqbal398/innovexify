import { Injectable } from "@nestjs/common";
import type { CaseStage, CaseStatus, NoteVisibility, Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";
import {
  caseSelect,
  eventSelect,
  filingSelect,
  noteSelect,
  type CaseRecord,
  type EventRecord,
  type FilingRecord,
  type NoteRecord,
} from "../interfaces/cases.interfaces";

type Db = Prisma.TransactionClient;

/** Fields a stage move or an edit may write. The version guard and the increment are added here, in one place. */
export interface CaseChange {
  stage?: CaseStage;
  status?: CaseStatus;
  priority?: Prisma.CaseUncheckedUpdateManyInput["priority"];
  deadline?: Date | null;
  ownerId?: string | null;
  serviceId?: string;
  filingConfirmation?: string;
  completedAt?: Date | null;
}

/** All database access for the cases module. */
@Injectable()
export class CasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, { timeout: 15_000, maxWait: 10_000 });
  }

  async page(where: Prisma.CaseWhereInput, orderBy: Prisma.CaseOrderByWithRelationInput[], skip: number, take: number): Promise<[CaseRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.case.findMany({ where, orderBy, skip, take, select: caseSelect }),
      this.prisma.case.count({ where }),
    ]);
  }

  findOne(where: Prisma.CaseWhereInput, db: Db = this.prisma): Promise<CaseRecord | null> {
    return db.case.findFirst({ where, select: caseSelect });
  }

  findById(id: string, db: Db = this.prisma): Promise<CaseRecord | null> {
    return db.case.findUnique({ where: { id }, select: caseSelect });
  }

  findClient(where: Prisma.UserWhereInput, db: Db = this.prisma) {
    return db.user.findFirst({
      where,
      select: { id: true, name: true, status: true, deletedAt: true, clientProfile: { select: { caseNumber: true, csrId: true } } },
    });
  }

  openCaseOf(clientId: string, db: Db = this.prisma): Promise<{ id: string } | null> {
    // Open = not removed and not completed. A client whose cases are all completed may get a new one.
    return db.case.findFirst({ where: { clientId, deletedAt: null, stage: { not: "COMPLETED" } }, select: { id: true } });
  }

  findService(id: string, db: Db = this.prisma) {
    return db.service.findUnique({ where: { id }, select: { id: true, name: true, active: true } });
  }

  findStaff(id: string, db: Db = this.prisma) {
    return db.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, role: true, status: true } });
  }

  async create(
    data: { number: number; clientId: string; serviceId: string; stage: CaseStage; priority: Prisma.CaseUncheckedCreateInput["priority"]; deadline: Date; byId: string },
    db: Db,
  ): Promise<{ id: string }> {
    return db.case.create({
      data: {
        number: data.number,
        clientId: data.clientId,
        serviceId: data.serviceId,
        stage: data.stage,
        status: "AWAITING_CLIENT",
        priority: data.priority,
        deadline: data.deadline,
        events: { create: { toStage: data.stage, byId: data.byId, note: "Case created" } },
      },
      select: { id: true },
    });
  }

  updateClientProfile(userId: string, data: { businessName?: string; formationState?: string }, db: Db) {
    return db.clientProfile.update({ where: { userId }, data });
  }

  /**
   * The optimistic lock: `UPDATE "Case" SET ..., version = version + 1 WHERE id = $1 AND version = $2`.
   * Returns false when no row matched, which means someone changed the case after the caller read it.
   * Only this one row is touched (and locked, until the transaction ends); nothing else is blocked.
   */
  async updateIfVersion(id: string, version: number, change: CaseChange, db: Db): Promise<boolean> {
    const result = await db.case.updateMany({
      where: { id, version },
      data: { ...change, lastActivityAt: new Date(), version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** Notes and similar activity move "last activity" without counting as a change to the case's fields. */
  touch(id: string, db: Db) {
    return db.case.update({ where: { id }, data: { lastActivityAt: new Date() }, select: { id: true } });
  }

  addEvent(data: { caseId: string; toStage: CaseStage | null; byId: string; note: string }, db: Db) {
    return db.caseEvent.create({ data, select: { id: true } });
  }

  addNote(data: { caseId: string; authorId: string; visibility: NoteVisibility; text: string }, db: Db): Promise<NoteRecord> {
    return db.caseNote.create({ data, select: noteSelect });
  }

  events(caseId: string, where: Prisma.CaseEventWhereInput = {}, db: Db = this.prisma): Promise<EventRecord[]> {
    return db.caseEvent.findMany({ where: { caseId, ...where }, orderBy: [{ at: "asc" }, { id: "asc" }], select: eventSelect });
  }

  async eventPage(caseId: string, where: Prisma.CaseEventWhereInput, order: "asc" | "desc", skip: number, take: number): Promise<[EventRecord[], number]> {
    const filter = { caseId, ...where };
    return this.prisma.$transaction([
      this.prisma.caseEvent.findMany({ where: filter, orderBy: [{ at: order }, { id: order }], skip, take, select: eventSelect }),
      this.prisma.caseEvent.count({ where: filter }),
    ]);
  }

  notes(caseId: string, visibilities: NoteVisibility[], db: Db = this.prisma): Promise<NoteRecord[]> {
    if (visibilities.length === 0) return Promise.resolve([]);
    return db.caseNote.findMany({ where: { caseId, visibility: { in: visibilities } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: noteSelect });
  }

  filings(caseId: string, db: Db = this.prisma): Promise<FilingRecord[]> {
    return db.filing.findMany({ where: { caseId }, orderBy: { number: "asc" }, select: filingSelect });
  }

  async taskCounts(caseId: string, clientVisibleOnly: boolean, today: Date, db: Db = this.prisma) {
    const base: Prisma.TaskWhereInput = { caseId, ...(clientVisibleOnly ? { visibility: "CLIENT" } : {}) };
    const [total, open, overdue] = await Promise.all([
      db.task.count({ where: base }),
      db.task.count({ where: { ...base, done: false } }),
      db.task.count({ where: { ...base, done: false, due: { lt: today } } }),
    ]);
    return { total, open, overdue };
  }
}
