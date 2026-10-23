import { Injectable } from "@nestjs/common";
import type { InteractionType, Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

type Db = Prisma.TransactionClient;

export const followUpSelect = {
  id: true,
  clientId: true,
  csrId: true,
  type: true,
  due: true,
  status: true,
  note: true,
  outcome: true,
  doneAt: true,
  createdAt: true,
  client: { select: { id: true, name: true, status: true, clientProfile: { select: { caseNumber: true, csrId: true } } } },
  csr: { select: { id: true, name: true } },
} satisfies Prisma.FollowUpSelect;
export type FollowUpRecord = Prisma.FollowUpGetPayload<{ select: typeof followUpSelect }>;

export const interactionSelect = {
  id: true,
  kind: true,
  text: true,
  at: true,
  by: { select: { id: true, name: true } },
} satisfies Prisma.InteractionSelect;
export type InteractionRecord = Prisma.InteractionGetPayload<{ select: typeof interactionSelect }>;

const clientForFollowUpSelect = {
  id: true,
  name: true,
  status: true,
  clientProfile: { select: { caseNumber: true, csrId: true } },
} satisfies Prisma.UserSelect;
export type ClientForFollowUp = Prisma.UserGetPayload<{ select: typeof clientForFollowUpSelect }>;

/** All database access for follow-ups and interactions. */
@Injectable()
export class FollowUpsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, { timeout: 15_000 });
  }

  async page(where: Prisma.FollowUpWhereInput, orderBy: Prisma.FollowUpOrderByWithRelationInput[], skip: number, take: number): Promise<[FollowUpRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.followUp.findMany({ where, orderBy, skip, take, select: followUpSelect }),
      this.prisma.followUp.count({ where }),
    ]);
  }

  findOne(where: Prisma.FollowUpWhereInput, db: Db = this.prisma): Promise<FollowUpRecord | null> {
    return db.followUp.findFirst({ where, select: followUpSelect });
  }

  findById(id: string, db: Db = this.prisma): Promise<FollowUpRecord | null> {
    return db.followUp.findUnique({ where: { id }, select: followUpSelect });
  }

  findClient(where: Prisma.UserWhereInput, db: Db = this.prisma): Promise<ClientForFollowUp | null> {
    return db.user.findFirst({ where, select: clientForFollowUpSelect });
  }

  create(data: { clientId: string; csrId: string; type: InteractionType; due: Date; note: string }, db: Db): Promise<{ id: string }> {
    return db.followUp.create({ data, select: { id: true } });
  }

  update(id: string, data: Prisma.FollowUpUncheckedUpdateInput, db: Db): Promise<{ id: string }> {
    return db.followUp.update({ where: { id }, data, select: { id: true } });
  }

  /** Marks an OPEN follow-up done. False when it was no longer open (someone else just completed it). */
  async markDone(id: string, outcome: string, db: Db): Promise<boolean> {
    const result = await db.followUp.updateMany({ where: { id, status: "OPEN" }, data: { status: "DONE", outcome, doneAt: new Date() } });
    return result.count === 1;
  }

  /** Deletes an OPEN follow-up. False when it wasn't open. */
  async removeIfOpen(id: string, db: Db): Promise<boolean> {
    const result = await db.followUp.deleteMany({ where: { id, status: "OPEN" } });
    return result.count === 1;
  }

  addInteraction(data: { clientId: string; byId: string; kind: InteractionType; text: string }, db: Db): Promise<InteractionRecord> {
    return db.interaction.create({ data, select: interactionSelect });
  }

  async interactionPage(clientId: string, order: "asc" | "desc", skip: number, take: number): Promise<[InteractionRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.interaction.findMany({ where: { clientId }, orderBy: [{ at: order }, { id: order }], skip, take, select: interactionSelect }),
      this.prisma.interaction.count({ where: { clientId } }),
    ]);
  }

  /** The newest interactions across the clients in `where`, each with its client. */
  async recentInteractions(where: Prisma.InteractionWhereInput, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.interaction.findMany({
        where,
        orderBy: [{ at: "desc" }, { id: "desc" }],
        skip,
        take,
        select: { ...interactionSelect, client: { select: { id: true, name: true, clientProfile: { select: { caseNumber: true } } } } },
      }),
      this.prisma.interaction.count({ where }),
    ]);
  }
}
