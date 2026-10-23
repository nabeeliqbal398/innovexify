import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

export const auditSelect = {
  id: true,
  action: true,
  target: true,
  ok: true,
  category: true,
  actorRole: true,
  requestId: true,
  ipAddress: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} satisfies Prisma.AuditLogSelect;
export type AuditRecord = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>;

/**
 * Read-only access to the audit log. This repository has no create, update or delete: entries are written only by
 * AuditService, and nothing in the API can change or remove one.
 */
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async page(where: Prisma.AuditLogWhereInput, order: "asc" | "desc", skip: number, take: number): Promise<[AuditRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: order }, { id: order }], skip, take, select: auditSelect }),
      this.prisma.auditLog.count({ where }),
    ]);
  }

  count(where: Prisma.AuditLogWhereInput): Promise<number> {
    return this.prisma.auditLog.count({ where });
  }

  /** The next batch for a streaming export: newest first, continuing after `after` (keyset, so memory stays flat). */
  batch(where: Prisma.AuditLogWhereInput, after: { createdAt: Date; id: string } | null, take: number): Promise<AuditRecord[]> {
    const next: Prisma.AuditLogWhereInput = after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {};
    return this.prisma.auditLog.findMany({ where: { AND: [where, next] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, select: auditSelect });
  }
}
