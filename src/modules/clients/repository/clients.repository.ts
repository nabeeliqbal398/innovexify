import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { ScopeActor } from "../../../common/scope/scope";
import { PrismaService } from "../../../prisma/prisma.service";
import { clientSelect, type ClientRecord } from "../interfaces/clients.interfaces";

type Db = Prisma.TransactionClient;

export interface ClientExtras {
  lastContactAt: Date | null;
  nextFollowUp: { id: string; due: Date; type: string } | null;
  onboarding: { done: number; total: number };
}

/** Raw SQL returns an enum's database label; the API speaks keys. */
const FOLLOW_UP_KEY: Record<string, string> = { Call: "CALL", Email: "EMAIL", "Portal message": "PORTAL_MESSAGE", Meeting: "MEETING" };

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

  /**
   * The newest entries of each source for one client (at most `take` each), unmerged. The service merges, hides what the viewer
   * may not see and cuts to the limit. `internal` ticket notes and message text of other clients never come into it.
   */
  async timelineSources(clientId: string, take: number, withRelationship: boolean) {
    const actorSelect = { select: { id: true, name: true, role: true } } as const;
    const [caseEvents, documentEvents, tickets, messages, interactions, followUps, client] = await Promise.all([
      this.prisma.caseEvent.findMany({
        where: { case: { is: { clientId, deletedAt: null } } },
        orderBy: [{ at: "desc" }, { id: "desc" }],
        take,
        select: { id: true, toStage: true, note: true, at: true, by: actorSelect, case: { select: { number: true } } },
      }),
      this.prisma.documentEvent.findMany({
        where: { document: { is: { clientId, deletedAt: null } } },
        orderBy: [{ at: "desc" }, { id: "desc" }],
        take,
        select: { id: true, status: true, note: true, at: true, by: actorSelect, document: { select: { name: true } } },
      }),
      this.prisma.ticket.findMany({
        where: { clientId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: { id: true, number: true, title: true, status: true, createdAt: true, client: actorSelect },
      }),
      this.prisma.message.findMany({
        where: { clientId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: { id: true, text: true, createdAt: true, sender: actorSelect },
      }),
      withRelationship
        ? this.prisma.interaction.findMany({
            where: { clientId },
            orderBy: [{ at: "desc" }, { id: "desc" }],
            take,
            select: { id: true, kind: true, text: true, at: true, by: actorSelect },
          })
        : Promise.resolve([]),
      withRelationship
        ? this.prisma.followUp.findMany({
            where: { clientId, status: "DONE", doneAt: { not: null } },
            orderBy: [{ doneAt: "desc" }, { id: "desc" }],
            take,
            select: { id: true, type: true, note: true, outcome: true, doneAt: true, csr: actorSelect },
          })
        : Promise.resolve([]),
      this.prisma.user.findUnique({
        where: { id: clientId },
        select: { id: true, name: true, status: true, clientProfile: { select: { joinedAt: true } }, createdAt: true },
      }),
    ]);
    return { caseEvents, documentEvents, tickets, messages, interactions, followUps, client };
  }

  /**
   * What the clients table shows beyond the profile, for the clients on one page (a few small subqueries each, by primary key).
   * The follow-up is the earliest open one the caller may see: any for Admin and Manager, their own for a CSR, none otherwise.
   */
  async extras(actor: ScopeActor, ids: readonly string[]): Promise<Map<string, ClientExtras>> {
    if (ids.length === 0) return new Map();
    const followUpScope =
      actor.role === "ADMIN" || actor.role === "MANAGER" ? Prisma.sql`TRUE` : actor.role === "CSR" ? Prisma.sql`f."csrId" = ${actor.id}` : Prisma.sql`FALSE`;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; last_contact: Date | null; fu_id: string | null; fu_due: Date | null; fu_type: string | null; steps: number }>
    >`
      SELECT u.id,
        GREATEST(
          (SELECT max(m."createdAt") FROM "Message" m JOIN "User" s ON s.id = m."senderId" WHERE m."clientId" = u.id AND s.role <> 'CLIENT'::"Role"),
          (SELECT max(i."at") FROM "Interaction" i WHERE i."clientId" = u.id),
          (SELECT max(f."doneAt") FROM "FollowUp" f WHERE f."clientId" = u.id)
        ) AS last_contact,
        nf.id AS fu_id, nf.due AS fu_due, nf.type::text AS fu_type,
        ( (u.status = 'Active'::"UserStatus")::int
        + (COALESCE(cp.phone, '') <> '' OR COALESCE(cp.address, '') <> '')::int
        + EXISTS (SELECT 1 FROM "Case" c WHERE c."clientId" = u.id AND c."deletedAt" IS NULL)::int
        + EXISTS (SELECT 1 FROM "Case" c WHERE c."clientId" = u.id AND c."deletedAt" IS NULL AND c.stage >= 'Documents Under Review'::"CaseStage")::int
        + (NOT EXISTS (SELECT 1 FROM "Document" d WHERE d."clientId" = u.id AND d."deletedAt" IS NULL
              AND d.status IN ('requested'::"DocStatus", 'rejected'::"DocStatus", 'info'::"DocStatus")))::int ) AS steps
      FROM "User" u
      LEFT JOIN "ClientProfile" cp ON cp."userId" = u.id
      LEFT JOIN LATERAL (
        SELECT f.id, f.due, f.type FROM "FollowUp" f
        WHERE f."clientId" = u.id AND f.status = 'Open'::"FollowUpStatus" AND ${followUpScope}
        ORDER BY f.due ASC, f.id ASC LIMIT 1
      ) nf ON TRUE
      WHERE u.id IN (${Prisma.join(ids)})`;
    return new Map(
      rows.map((r) => [
        r.id,
        {
          lastContactAt: r.last_contact,
          nextFollowUp: r.fu_id && r.fu_due && r.fu_type ? { id: r.fu_id, due: r.fu_due, type: FOLLOW_UP_KEY[r.fu_type] ?? r.fu_type } : null,
          onboarding: { done: Number(r.steps), total: 5 },
        },
      ]),
    );
  }
}
