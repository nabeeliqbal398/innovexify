import { Global, Injectable, Module } from "@nestjs/common";
import type { Prisma, Role } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";

export interface AuditInput {
  actorId?: string | null;
  actorRole?: Role | null;
  action: string;
  target?: string;
  ok?: boolean;
  category?: string;
  requestId?: string;
  ipAddress?: string;
}

/** Writes who did what to the audit log. Refused attempts are recorded too (`ok: false`). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass the transaction client to make the entry part of the caller's transaction (it commits or rolls back with it). */
  async record(entry: AuditInput, db: Prisma.TransactionClient = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action.slice(0, 500),
        target: (entry.target ?? "").slice(0, 200),
        ok: entry.ok ?? true,
        category: entry.category ?? "",
        requestId: entry.requestId,
        ipAddress: entry.ipAddress,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
