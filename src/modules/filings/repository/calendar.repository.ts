import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { caseScope, documentScope, taskScope, type ScopeActor } from "../../../common/scope/scope";
import { PrismaService } from "../../../prisma/prisma.service";

export const CAP = 500;
/** A document request nobody answered for this long gets a "chase" entry. */
export const CHASE_AFTER_DAYS = 7;
const DAY = 86_400_000;

const OPEN_CASE: Prisma.CaseWhereInput = { NOT: { OR: [{ stage: "COMPLETED" }, { status: "COMPLETED" }] } };
const OPEN_FILING: Prisma.FilingWhereInput = { status: { notIn: ["APPROVED", "REJECTED"] } };
const OWED_DOC: Prisma.DocumentWhereInput = { status: { in: ["REQUESTED", "REJECTED", "INFO"] } };

interface Window {
  from: Date;
  /** Exclusive upper bound (the day after the last day shown). */
  to: Date;
}

/** The dated work the Compliance calendar shows, all read under the caller's data scope. */
@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  cases(actor: ScopeActor, w: Window) {
    return this.prisma.case.findMany({
      where: { AND: [caseScope(actor), OPEN_CASE, { deadline: { gte: w.from, lt: w.to } }] },
      orderBy: [{ deadline: "asc" }, { number: "asc" }],
      take: CAP,
      select: { id: true, number: true, deadline: true, client: { select: { name: true } } },
    });
  }

  filings(actor: ScopeActor, w: Window) {
    return this.prisma.filing.findMany({
      where: { AND: [{ case: { is: caseScope(actor) } }, OPEN_FILING, { nextActionDate: { gte: w.from, lt: w.to } }] },
      orderBy: [{ nextActionDate: "asc" }, { number: "asc" }],
      take: CAP,
      select: { id: true, nextAction: true, nextActionDate: true, case: { select: { id: true, number: true, client: { select: { name: true } } } } },
    });
  }

  /** Requests the client still owes, whose "chase" date (request + 7 days) falls in the window. */
  missing(actor: ScopeActor, w: Window) {
    const shift = CHASE_AFTER_DAYS * DAY;
    return this.prisma.document.findMany({
      where: { AND: [documentScope(actor), OWED_DOC, { requestedAt: { gte: new Date(w.from.getTime() - shift), lt: new Date(w.to.getTime() - shift) } }] },
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
      take: CAP,
      select: { id: true, name: true, requestedAt: true, client: { select: { name: true } } },
    });
  }

  tasks(actor: ScopeActor, w: Window) {
    return this.prisma.task.findMany({
      where: { AND: [taskScope(actor), { type: "COMPLIANCE", done: false, due: { gte: w.from, lt: w.to } }] },
      orderBy: [{ due: "asc" }, { id: "asc" }],
      take: CAP,
      select: { id: true, title: true, due: true, case: { select: { id: true, number: true, client: { select: { name: true } } } } },
    });
  }

  reminders(actor: ScopeActor, w: Window) {
    return this.prisma.reminder.findMany({
      where: { AND: [{ case: { is: caseScope(actor) } }, { date: { gte: w.from, lt: w.to } }] },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      take: CAP,
      select: { id: true, title: true, date: true, case: { select: { id: true, number: true, client: { select: { name: true } } } } },
    });
  }

  /** How many items of any kind are dated before `today`, anywhere (the badge next to the filters). */
  async overdue(actor: ScopeActor, today: Date): Promise<number> {
    const chase = new Date(today.getTime() - CHASE_AFTER_DAYS * DAY);
    const counts = await Promise.all([
      this.prisma.case.count({ where: { AND: [caseScope(actor), OPEN_CASE, { deadline: { lt: today } }] } }),
      this.prisma.filing.count({ where: { AND: [{ case: { is: caseScope(actor) } }, OPEN_FILING, { nextActionDate: { lt: today } }] } }),
      this.prisma.document.count({ where: { AND: [documentScope(actor), OWED_DOC, { requestedAt: { lt: chase } }] } }),
      this.prisma.task.count({ where: { AND: [taskScope(actor), { type: "COMPLIANCE", done: false, due: { lt: today } }] } }),
      this.prisma.reminder.count({ where: { AND: [{ case: { is: caseScope(actor) } }, { date: { lt: today } }] } }),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  }
}
