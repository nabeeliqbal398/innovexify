import { Injectable, Logger, StreamableFile } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Readable } from "node:stream";

import { AuditService } from "../../../common/audit/audit.service";
import { ValidationFailedException } from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { paginate, parseSort } from "../../../common/pagination/paginate";
import type { PaginatedResponse } from "../../../common/responses/api-response";
import { addDays } from "../../../common/utils/dates";
import { dateOnly } from "../../../common/validators/iso-date";
import type { AuditEntryDto, AuditFilterDto, ListAuditQueryDto } from "../dto/audit.dto";
import { CSV_BOM, csvRow } from "../interfaces/csv";
import { AuditRepository, type AuditRecord } from "../repository/audit.repository";

export const EXPORT_ROW_CAP = 50_000;
const BATCH = 1_000;

const toDto = (a: AuditRecord): AuditEntryDto => ({
  id: a.id,
  at: a.createdAt,
  actor: a.actor,
  actorRole: a.actorRole,
  action: a.action,
  target: a.target,
  ok: a.ok,
  category: a.category,
  requestId: a.requestId,
  ipAddress: a.ipAddress,
});

/**
 * Reading the audit log. There is deliberately nothing here that writes, updates or deletes an entry, and no route that does.
 * Retention is manual for now: entries stay until someone with database access removes them. See the module's SPECS.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly repo: AuditRepository,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAuditQueryDto): Promise<PaginatedResponse<AuditEntryDto>> {
    const sort = parseSort(query, ["createdAt"] as const, { field: "createdAt", order: "desc" });
    const where = this.where(query);
    return paginate(query, ({ skip, take }) => this.repo.page(where, sort.order, skip, take), toDto);
  }

  /**
   * A CSV of the entries that match, newest first, streamed in batches. At most 50,000 rows: when more match, the newest
   * 50,000 are exported and `truncated` says so (the controller turns it into headers). The export itself is audited.
   */
  async export(c: ActorContext, query: AuditFilterDto): Promise<{ file: StreamableFile; matched: number; exported: number; truncated: boolean }> {
    // Entries up to this moment only, so the row written for the export itself never displaces one of the rows counted here.
    const startedAt = new Date();
    const where: Prisma.AuditLogWhereInput = { AND: [this.where(query), { createdAt: { lte: startedAt } }] };
    const matched = await this.repo.count(where);
    const exported = Math.min(matched, EXPORT_ROW_CAP);
    await this.audit.record({
      actorId: c.actor.id,
      actorRole: c.actor.role,
      action: `Exported the audit log (${exported} row${exported === 1 ? "" : "s"}${matched > exported ? `, newest of ${matched}` : ""})`,
      target: "Audit log",
      category: "settings",
      requestId: c.requestId,
      ipAddress: c.ipAddress,
    });

    const repo = this.repo;
    const logger = this.logger;
    async function* rows(): AsyncGenerator<string> {
      yield CSV_BOM + csvRow(["Time (UTC)", "Actor", "Role", "Category", "Action", "Target", "Result", "Request ID"]);
      let sent = 0;
      let after: { createdAt: Date; id: string } | null = null;
      try {
        while (sent < exported) {
          const batch: AuditRecord[] = await repo.batch(where, after, Math.min(BATCH, exported - sent));
          if (batch.length === 0) break;
          yield batch.map((a) => csvRow([a.createdAt, a.actor?.name ?? "", a.actorRole ?? "", a.category, a.action, a.target, a.ok ? "allowed" : "refused", a.requestId ?? ""])).join("");
          sent += batch.length;
          const last = batch[batch.length - 1] as AuditRecord;
          after = { createdAt: last.createdAt, id: last.id };
        }
      } catch (error) {
        // The headers are already out, so the best that can be done is to stop and say so in the log.
        logger.error(`Audit export stopped early: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
    return { file: new StreamableFile(Readable.from(rows())), matched, exported, truncated: matched > exported };
  }

  private where(query: AuditFilterDto): Prisma.AuditLogWhereInput {
    if (query.from && query.to && query.from > query.to) throw new ValidationFailedException([{ field: "to", message: "to can't be before from." }]);
    const search = query.search?.trim();
    const refused = query.category === "refused";
    return {
      AND: [
        ...(query.actorId ? [{ actorId: query.actorId }] : []),
        // "Refused attempts" is the audit view's category for entries that didn't succeed, whatever their subject.
        ...(query.category && !refused ? [{ category: query.category }] : []),
        ...(refused ? [{ ok: false }] : []),
        ...(query.ok !== undefined ? [{ ok: query.ok }] : []),
        ...(query.from || query.to
          ? [{ createdAt: { ...(query.from ? { gte: dateOnly(query.from) } : {}), ...(query.to ? { lt: addDays(dateOnly(query.to), 1) } : {}) } }]
          : []),
        ...(search
          ? [
              {
                OR: [
                  { action: { contains: search, mode: "insensitive" as const } },
                  { target: { contains: search, mode: "insensitive" as const } },
                  { actor: { is: { name: { contains: search, mode: "insensitive" as const } } } },
                ],
              },
            ]
          : []),
      ],
    };
  }
}
