import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";
import { taskSelect, type TaskRecord } from "../interfaces/tasks.interfaces";

type Db = Prisma.TransactionClient;

const caseForTaskSelect = {
  id: true,
  number: true,
  stage: true,
  deletedAt: true,
  clientId: true,
  client: { select: { id: true, name: true, clientProfile: { select: { caseNumber: true, csrId: true } } } },
} satisfies Prisma.CaseSelect;
export type CaseForTask = Prisma.CaseGetPayload<{ select: typeof caseForTaskSelect }>;

/** All database access for the tasks module. */
@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, { timeout: 15_000 });
  }

  async page(where: Prisma.TaskWhereInput, orderBy: Prisma.TaskOrderByWithRelationInput[], skip: number, take: number): Promise<[TaskRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.task.findMany({ where, orderBy, skip, take, select: taskSelect }),
      this.prisma.task.count({ where }),
    ]);
  }

  findOne(where: Prisma.TaskWhereInput, db: Db = this.prisma): Promise<TaskRecord | null> {
    return db.task.findFirst({ where, select: taskSelect });
  }

  findById(id: string, db: Db = this.prisma): Promise<TaskRecord | null> {
    return db.task.findUnique({ where: { id }, select: taskSelect });
  }

  findCase(where: Prisma.CaseWhereInput, db: Db = this.prisma): Promise<CaseForTask | null> {
    return db.case.findFirst({ where, select: caseForTaskSelect });
  }

  findUser(id: string, db: Db = this.prisma) {
    return db.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, role: true, status: true } });
  }

  /** The client's document requests that are still open: the ones a duplicate task would repeat. */
  openDocumentRequests(clientId: string, db: Db = this.prisma): Promise<Array<{ name: string }>> {
    return db.document.findMany({ where: { clientId, deletedAt: null, status: { in: ["REQUESTED", "REJECTED", "INFO"] } }, select: { name: true } });
  }

  create(data: Prisma.TaskUncheckedCreateInput, db: Db): Promise<{ id: string }> {
    return db.task.create({ data, select: { id: true } });
  }

  update(id: string, data: Prisma.TaskUncheckedUpdateInput, db: Db): Promise<{ id: string }> {
    return db.task.update({ where: { id }, data, select: { id: true } });
  }

  /**
   * Marks the task done (or open) only if it isn't already, and says whether it changed. Two people clicking at once
   * can't both "complete" it: exactly one UPDATE matches.
   */
  async setDone(id: string, done: boolean, by: string, db: Db): Promise<boolean> {
    const result = await db.task.updateMany({
      where: { id, done: !done },
      data: done ? { done: true, completedById: by, completedAt: new Date() } : { done: false, completedById: null, completedAt: null },
    });
    return result.count === 1;
  }

  async remove(id: string, db: Db): Promise<void> {
    await db.task.delete({ where: { id } });
  }
}
