import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { clientIdInScope } from "../../../common/scope/scope-sql";
import type { ScopeActor } from "../../../common/scope/scope";
import { PrismaService } from "../../../prisma/prisma.service";

type Db = Prisma.TransactionClient;

export const messageSelect = {
  id: true,
  clientId: true,
  text: true,
  senderId: true,
  attachmentName: true,
  attachmentKey: true,
  attachmentMime: true,
  attachmentSize: true,
  createdAt: true,
  sender: { select: { id: true, name: true, role: true } },
} satisfies Prisma.MessageSelect;
export type MessageRecord = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

export interface ConversationRow {
  id: string;
  name: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED";
  caseNumber: string | null;
  businessName: string | null;
  lastId: string | null;
  lastText: string | null;
  lastSenderId: string | null;
  lastSenderName: string | null;
  lastAttachment: string | null;
  lastAt: Date | null;
  unread: number;
}

/** All database access for messages. Aggregates (unread counts, the conversation list) are computed in SQL. */
const STATUS_KEY: Record<string, ConversationRow["status"]> = { Active: "ACTIVE", Invited: "INVITED", Suspended: "SUSPENDED", Removed: "REMOVED" };

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, { timeout: 15_000 });
  }

  findClient(where: Prisma.UserWhereInput, db: Db = this.prisma) {
    return db.user.findFirst({ where, select: { id: true, name: true, status: true, deletedAt: true, clientProfile: { select: { caseNumber: true, csrId: true } } } });
  }

  findMessage(where: Prisma.MessageWhereInput, db: Db = this.prisma): Promise<MessageRecord | null> {
    return db.message.findFirst({ where, select: messageSelect });
  }

  findMany(where: Prisma.MessageWhereInput, order: "asc" | "desc", take: number, db: Db = this.prisma): Promise<MessageRecord[]> {
    return db.message.findMany({ where, orderBy: [{ createdAt: order }, { id: order }], take, select: messageSelect });
  }

  create(data: Prisma.MessageUncheckedCreateInput, db: Db): Promise<MessageRecord> {
    return db.message.create({ data, select: messageSelect });
  }

  /** The newest message of a thread. */
  newest(clientId: string, db: Db = this.prisma): Promise<{ id: string; createdAt: Date } | null> {
    return db.message.findFirst({ where: { clientId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } });
  }

  /** Moves the read marker forward, never back, so reading twice (or two tabs at once) is harmless. Returns the marker. */
  async advanceReadMarker(userId: string, clientId: string, upTo: Date, db: Db): Promise<Date> {
    const rows = await db.$queryRaw<Array<{ readUpTo: Date }>>`
      INSERT INTO "ConversationRead" ("userId", "clientId", "readUpTo") VALUES (${userId}, ${clientId}, ${upTo})
      ON CONFLICT ("userId", "clientId") DO UPDATE SET "readUpTo" = GREATEST("ConversationRead"."readUpTo", EXCLUDED."readUpTo")
      RETURNING "readUpTo"`;
    return rows[0]?.readUpTo ?? upTo;
  }

  async readMarker(userId: string, clientId: string, db: Db = this.prisma): Promise<Date | null> {
    return (await db.conversationRead.findUnique({ where: { userId_clientId: { userId, clientId } }, select: { readUpTo: true } }))?.readUpTo ?? null;
  }

  /** Messages in a thread written by someone else after the marker. */
  async unreadIn(userId: string, clientId: string, marker: Date | null, db: Db = this.prisma): Promise<number> {
    return db.message.count({ where: { clientId, senderId: { not: userId }, ...(marker ? { createdAt: { gt: marker } } : {}) } });
  }

  /** Unread messages across every thread the actor may see. */
  async totalUnread(actor: ScopeActor): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n
      FROM "Message" m
      LEFT JOIN "ConversationRead" r ON r."clientId" = m."clientId" AND r."userId" = ${actor.id}
      WHERE m."senderId" <> ${actor.id}
        AND (r."readUpTo" IS NULL OR m."createdAt" > r."readUpTo")
        AND ${clientIdInScope(actor, Prisma.sql`m."clientId"`)}`;
    return rows[0]?.n ?? 0;
  }

  /** One row per client thread the actor may see: last message and unread count, unread threads first. */
  async conversations(actor: ScopeActor, skip: number, take: number): Promise<[ConversationRow[], number]> {
    const scope = clientIdInScope(actor, Prisma.sql`u.id`);
    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<ConversationRow[]>`
        SELECT u.id, u.name, u.status::text AS status, cp."caseNumber", cp."businessName",
               lm.id AS "lastId", lm.text AS "lastText", lm."senderId" AS "lastSenderId", su.name AS "lastSenderName",
               lm."attachmentName" AS "lastAttachment", lm."createdAt" AS "lastAt",
               COALESCE(un.n, 0)::int AS unread
        FROM "User" u
        JOIN "ClientProfile" cp ON cp."userId" = u.id
        LEFT JOIN LATERAL (SELECT m.* FROM "Message" m WHERE m."clientId" = u.id ORDER BY m."createdAt" DESC, m.id DESC LIMIT 1) lm ON TRUE
        LEFT JOIN "User" su ON su.id = lm."senderId"
        LEFT JOIN "ConversationRead" r ON r."clientId" = u.id AND r."userId" = ${actor.id}
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS n FROM "Message" m
          WHERE m."clientId" = u.id AND m."senderId" <> ${actor.id} AND (r."readUpTo" IS NULL OR m."createdAt" > r."readUpTo")
        ) un ON TRUE
        WHERE u.role = 'CLIENT' AND u."deletedAt" IS NULL AND ${scope}
        ORDER BY COALESCE(un.n, 0) DESC, lm."createdAt" DESC NULLS LAST, u.name ASC, u.id ASC
        LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n FROM "User" u JOIN "ClientProfile" cp ON cp."userId" = u.id
        WHERE u.role = 'CLIENT' AND u."deletedAt" IS NULL AND ${scope}`,
    ]);
    // Raw SQL gives the database label ("Active"); the API speaks the enum key ("ACTIVE").
    return [rows.map((r) => ({ ...r, status: STATUS_KEY[r.status] ?? r.status })), count[0]?.n ?? 0];
  }
}
