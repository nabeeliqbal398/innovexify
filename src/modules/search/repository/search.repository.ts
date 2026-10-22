import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { ScopeActor } from "../../../common/scope/scope";
import { caseInScope, clientIdInScope, taskInScope } from "../../../common/scope/scope-sql";
import { PrismaService } from "../../../prisma/prisma.service";

export const PER_TYPE = 5;

/** `col ILIKE pattern ESCAPE '\'` for a column expression. */
const like = (column: string, pattern: string): Prisma.Sql => Prisma.sql`${Prisma.raw(column)} ILIKE ${pattern} ESCAPE '\\'`;

export interface ClientHit { id: string; name: string; caseNumber: string; businessName: string }
export interface CaseHit { id: string; number: number; clientName: string; stage: string; status: string }
export interface TaskHit { id: string; title: string; caseNumber: number; due: Date; done: boolean }
export interface TicketHit { id: string; number: number; title: string; status: string; clientName: string }
export interface MessageHit { id: string; clientId: string; clientName: string; senderName: string; text: string; createdAt: Date }
export interface DocumentHit { id: string; name: string; status: string }

/**
 * One query per kind of result, each with the caller's scope in its WHERE and LIMIT 5. The pattern is always a bound
 * parameter with wildcards escaped (never text pasted into the SQL). Internal ticket notes, document contents, and report
 * text are not searched.
 */
@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  clients(actor: ScopeActor, p: string): Promise<ClientHit[]> {
    return this.prisma.$queryRaw<ClientHit[]>`
      SELECT u.id, u.name, cp."caseNumber" AS "caseNumber", cp."businessName" AS "businessName"
      FROM "User" u JOIN "ClientProfile" cp ON cp."userId" = u.id
      WHERE u.role = 'CLIENT'::"Role" AND u."deletedAt" IS NULL AND ${clientIdInScope(actor, Prisma.sql`u.id`)}
        AND (${like("u.name", p)} OR ${like("u.email", p)} OR ${like('cp."caseNumber"', p)} OR ${like('cp."businessName"', p)})
      ORDER BY u.name ASC, u.id ASC LIMIT ${PER_TYPE}`;
  }

  cases(actor: ScopeActor, p: string): Promise<CaseHit[]> {
    return this.prisma.$queryRaw<CaseHit[]>`
      SELECT c.id, c.number, u.name AS "clientName", c.stage::text AS stage, c.status::text AS status
      FROM "Case" c JOIN "User" u ON u.id = c."clientId" JOIN "ClientProfile" cp ON cp."userId" = u.id
      WHERE ${caseInScope(actor, "c")}
        AND (${like("'PRJ-' || c.number::text", p)} OR ${like('cp."caseNumber"', p)} OR ${like("u.name", p)} OR ${like('cp."businessName"', p)} OR ${like("c.stage::text", p)})
      ORDER BY c.number DESC LIMIT ${PER_TYPE}`;
  }

  tasks(actor: ScopeActor, p: string): Promise<TaskHit[]> {
    return this.prisma.$queryRaw<TaskHit[]>`
      SELECT k.id, k.title, c.number AS "caseNumber", k.due, k.done
      FROM "Task" k JOIN "Case" c ON c.id = k."caseId"
      WHERE ${taskInScope(actor, "k", "c")} AND ${like("k.title", p)}
      ORDER BY k.due ASC, k.id ASC LIMIT ${PER_TYPE}`;
  }

  tickets(actor: ScopeActor, p: string): Promise<TicketHit[]> {
    return this.prisma.$queryRaw<TicketHit[]>`
      SELECT t.id, t.number, t.title, t.status::text AS status, u.name AS "clientName"
      FROM "Ticket" t JOIN "User" u ON u.id = t."clientId"
      WHERE ${clientIdInScope(actor, Prisma.sql`t."clientId"`)}
        AND (${like("'TKT-' || t.number::text", p)} OR ${like("t.title", p)} OR ${like("u.name", p)})
      ORDER BY t."createdAt" DESC, t.id ASC LIMIT ${PER_TYPE}`;
  }

  messages(actor: ScopeActor, p: string): Promise<MessageHit[]> {
    return this.prisma.$queryRaw<MessageHit[]>`
      SELECT m.id, m."clientId" AS "clientId", cu.name AS "clientName", su.name AS "senderName", m.text, m."createdAt" AS "createdAt"
      FROM "Message" m JOIN "User" cu ON cu.id = m."clientId" JOIN "User" su ON su.id = m."senderId"
      WHERE ${clientIdInScope(actor, Prisma.sql`m."clientId"`)} AND ${like("m.text", p)}
      ORDER BY m."createdAt" DESC, m.id ASC LIMIT ${PER_TYPE}`;
  }

  /** A client's own documents. Staff do not search documents. */
  documents(clientId: string, p: string): Promise<DocumentHit[]> {
    return this.prisma.$queryRaw<DocumentHit[]>`
      SELECT d.id, d.name, d.status::text AS status
      FROM "Document" d
      WHERE d."clientId" = ${clientId} AND d."deletedAt" IS NULL AND ${like("d.name", p)}
      ORDER BY d."createdAt" DESC, d.id ASC LIMIT ${PER_TYPE}`;
  }
}
