import { Injectable } from "@nestjs/common";
import type { Prisma, Role, TicketStatus } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

type Db = Prisma.TransactionClient;

export const ticketSelect = {
  id: true,
  number: true,
  clientId: true,
  caseId: true,
  title: true,
  description: true,
  category: true,
  priority: true,
  status: true,
  handlerId: true,
  escalated: true,
  resolutionNote: true,
  resolvedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, name: true, status: true, deletedAt: true, clientProfile: { select: { caseNumber: true, csrId: true } } } },
  handler: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
  case: { select: { id: true, number: true } },
} satisfies Prisma.TicketSelect;
export type TicketRecord = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

export const messageSelect = { id: true, text: true, internal: true, createdAt: true, author: { select: { id: true, name: true, role: true } } } satisfies Prisma.TicketMessageSelect;
export type TicketMessageRecord = Prisma.TicketMessageGetPayload<{ select: typeof messageSelect }>;

export const eventSelect = {
  id: true,
  fromStatus: true,
  toStatus: true,
  note: true,
  at: true,
  by: { select: { id: true, name: true, role: true } },
} satisfies Prisma.TicketEventSelect;
export type TicketEventRecord = Prisma.TicketEventGetPayload<{ select: typeof eventSelect }>;

/** What changes together with a status move. */
export interface StatusChange {
  status?: TicketStatus;
  handlerId?: string | null;
  escalated?: boolean;
  resolutionNote?: string;
  resolvedById?: string | null;
  resolvedAt?: Date | null;
}

/** All database access for tickets. */
@Injectable()
export class TicketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    // Creating a ticket holds the `ticket` counter's row lock until commit.
    return this.prisma.$transaction(work, { timeout: 20_000, maxWait: 15_000 });
  }

  async page(where: Prisma.TicketWhereInput, orderBy: Prisma.TicketOrderByWithRelationInput[], skip: number, take: number): Promise<[TicketRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.ticket.findMany({ where, orderBy, skip, take, select: ticketSelect }),
      this.prisma.ticket.count({ where }),
    ]);
  }

  findOne(where: Prisma.TicketWhereInput, db: Db = this.prisma): Promise<TicketRecord | null> {
    return db.ticket.findFirst({ where, select: ticketSelect });
  }

  findById(id: string, db: Db = this.prisma): Promise<TicketRecord | null> {
    return db.ticket.findUnique({ where: { id }, select: ticketSelect });
  }

  findClient(where: Prisma.UserWhereInput, db: Db = this.prisma) {
    return db.user.findFirst({ where, select: { id: true, name: true, status: true, deletedAt: true, clientProfile: { select: { caseNumber: true, csrId: true } } } });
  }

  findCase(id: string, db: Db = this.prisma) {
    return db.case.findFirst({ where: { id, deletedAt: null }, select: { id: true, number: true, clientId: true } });
  }

  findStaff(id: string, db: Db = this.prisma) {
    return db.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, role: true, status: true } });
  }

  staffIds(roles: readonly Role[], db: Db = this.prisma): Promise<string[]> {
    return db.user.findMany({ where: { role: { in: [...roles] }, status: "ACTIVE", deletedAt: null }, select: { id: true } }).then((rows) => rows.map((r) => r.id));
  }

  create(data: Prisma.TicketUncheckedCreateInput, db: Db): Promise<{ id: string }> {
    return db.ticket.create({ data, select: { id: true } });
  }

  addEvent(data: { ticketId: string; fromStatus: TicketStatus | null; toStatus: TicketStatus; byId: string; note: string }, db: Db) {
    return db.ticketEvent.create({ data, select: { id: true } });
  }

  addMessage(data: { ticketId: string; authorId: string; text: string; internal: boolean }, db: Db): Promise<TicketMessageRecord> {
    return db.ticketMessage.create({ data, select: messageSelect });
  }

  /** `internal: false` is a database filter, so a client's query never even loads an internal note. */
  messages(ticketId: string, includeInternal: boolean, db: Db = this.prisma): Promise<TicketMessageRecord[]> {
    return db.ticketMessage.findMany({ where: { ticketId, ...(includeInternal ? {} : { internal: false }) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: messageSelect });
  }

  /** `statusChangesOnly` leaves out events where the status didn't change (escalations, assignments), for a client. */
  async events(ticketId: string, statusChangesOnly: boolean, db: Db = this.prisma): Promise<TicketEventRecord[]> {
    const rows = await db.ticketEvent.findMany({ where: { ticketId }, orderBy: [{ at: "asc" }, { id: "asc" }], select: eventSelect });
    return statusChangesOnly ? rows.filter((e) => e.fromStatus !== e.toStatus) : rows;
  }

  /**
   * The optimistic lock: `UPDATE "Ticket" SET ..., version = version + 1 WHERE id = $1 AND version = $2`.
   * False when no row matched, meaning someone changed the ticket after the caller read it.
   */
  async updateIfVersion(id: string, version: number, change: StatusChange, db: Db): Promise<boolean> {
    const result = await db.ticket.updateMany({ where: { id, version }, data: { ...change, version: { increment: 1 } } });
    return result.count === 1;
  }

  /** Marks activity (a reply) without counting as a change that invalidates other people's versions. */
  async touch(id: string, db: Db): Promise<void> {
    await db.ticket.update({ where: { id }, data: { updatedAt: new Date() }, select: { id: true } });
  }
}
