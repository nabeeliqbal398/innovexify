import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";
import { clientSelect, type ClientRecord } from "../interfaces/clients.interfaces";

type Db = Prisma.TransactionClient;

/** All database access for the clients module. */
@Injectable()
export class ClientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    // Creating a client takes row locks on two counters until commit: give it room, but not forever.
    return this.prisma.$transaction(work, { timeout: 20_000, maxWait: 15_000 });
  }

  async page(where: Prisma.UserWhereInput, orderBy: Prisma.UserOrderByWithRelationInput[], skip: number, take: number): Promise<[ClientRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy, skip, take, select: clientSelect }),
      this.prisma.user.count({ where }),
    ]);
  }

  findOne(where: Prisma.UserWhereInput, db: Db = this.prisma): Promise<ClientRecord | null> {
    return db.user.findFirst({ where, select: clientSelect });
  }

  findHoldingEmail(email: string, db: Db = this.prisma): Promise<{ id: string } | null> {
    return db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, status: { not: "REMOVED" } }, select: { id: true } });
  }

  findCsr(id: string, db: Db = this.prisma) {
    return db.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, role: true, status: true } });
  }

  findService(id: string, db: Db = this.prisma) {
    return db.service.findUnique({ where: { id }, select: { id: true, name: true, active: true } });
  }

  async createClient(
    data: {
      email: string;
      name: string;
      invitedById: string;
      caseNumber: string;
      csrId: string | null;
      businessName: string;
      formationState: string;
    },
    db: Db,
  ): Promise<{ id: string }> {
    return db.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: "CLIENT",
        status: "INVITED",
        invitedById: data.invitedById,
        clientProfile: {
          create: { caseNumber: data.caseNumber, csrId: data.csrId, businessName: data.businessName, formationState: data.formationState },
        },
      },
      select: { id: true },
    });
  }

  async createInitialCase(
    data: { number: number; clientId: string; serviceId: string; priority: Prisma.CaseUncheckedCreateInput["priority"]; deadline: Date | null; byId: string },
    db: Db,
  ): Promise<{ id: string }> {
    return db.case.create({
      data: {
        number: data.number,
        clientId: data.clientId,
        serviceId: data.serviceId,
        stage: "INVITATION_SENT",
        status: "AWAITING_CLIENT",
        priority: data.priority,
        deadline: data.deadline,
        events: { create: { toStage: "INVITATION_SENT", byId: data.byId, note: "Case created" } },
      },
      select: { id: true },
    });
  }

  updateProfile(userId: string, data: Prisma.ClientProfileUpdateInput, db: Db) {
    return db.clientProfile.update({ where: { userId }, data });
  }
}
