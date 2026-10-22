import { Injectable } from "@nestjs/common";
import type { Prisma, ReportStatus } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import { CounterService, formatCaseDisplay } from "../../../common/counter/counter.service";
import {
  CaseClientMismatchException,
  ConcurrentModificationException,
  InvalidStateTransitionException,
  ReportClosedException,
  ResourceNotFoundException,
  UserRemovedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { NotificationService } from "../../../common/notifications/notification.service";
import { paginate, parseSort } from "../../../common/pagination/paginate";
import { AccessService } from "../../../common/permissions/access.service";
import type { PaginatedResponse } from "../../../common/responses/api-response";
import { clientScope, reportScope } from "../../../common/scope/scope";
import type { CreateReportDto, ListReportsQueryDto, ReportDetailDto, ReportDto, ReportMessageDto, ReportTextDto, SetReportStatusDto } from "../dto/reports.dto";
import {
  NEXT_REPORT_STATUS,
  NOTE_READERS,
  REPORT_LABEL,
  REPORT_SORT_FIELDS,
  type MessageRecord,
  type ReportRecord,
} from "../interfaces/reports.interfaces";
import { ReportsRepository } from "../repository/reports.repository";

type Db = Prisma.TransactionClient;

export const displayReport = (number: number): string => `RPT-${number}`;

export function toReportDto(r: ReportRecord): ReportDto {
  return {
    id: r.id,
    number: r.number,
    displayNumber: displayReport(r.number),
    title: r.title,
    body: r.body,
    category: r.category,
    priority: r.priority,
    action: r.action,
    status: r.status,
    statusLabel: REPORT_LABEL[r.status],
    client: { id: r.client.id, name: r.client.name, caseNumber: r.client.clientProfile?.caseNumber ?? "" },
    csr: r.csr,
    case: r.case ? { id: r.case.id, displayNumber: formatCaseDisplay(r.case.number) } : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const toMessageDto = (m: MessageRecord): ReportMessageDto => ({ id: m.id, text: m.text, isNote: m.isNote, author: m.author, at: m.createdAt });

/**
 * CSR reports to Compliance: a CSR raises something about one of their clients, Compliance answers and resolves it.
 * A CSR sees their own reports; Compliance, Manager and Admin see all. Compliance-only notes are for Compliance,
 * Manager and Admin and are never loaded for a CSR.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly counters: CounterService,
    private readonly notifications: NotificationService,
  ) {}

  // ---- reads --------------------------------------------------------------------------------------------------

  async list(c: ActorContext, query: ListReportsQueryDto): Promise<PaginatedResponse<ReportDto>> {
    const sort = parseSort(query, REPORT_SORT_FIELDS, { field: "createdAt", order: "desc" });
    const search = query.search?.trim();
    const number = search ? /^(?:rpt-?)?(\d{1,9})$/i.exec(search)?.[1] : undefined;
    const where: Prisma.ReportWhereInput = {
      AND: [
        reportScope(c.actor),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.priority ? [{ priority: query.priority }] : []),
        ...(query.category ? [{ category: query.category }] : []),
        ...(query.clientId ? [{ clientId: query.clientId }] : []),
        ...(query.csrId ? [{ csrId: query.csrId }] : []),
        ...(search
          ? [
              {
                OR: [
                  ...(number ? [{ number: Number(number) }] : []),
                  { title: { contains: search, mode: "insensitive" as const } },
                  { client: { is: { name: { contains: search, mode: "insensitive" as const } } } },
                ],
              },
            ]
          : []),
      ],
    };
    const orderBy: Prisma.ReportOrderByWithRelationInput[] = [{ [sort.field]: sort.order }, { id: "asc" }];
    return paginate(query, ({ skip, take }) => this.repo.page(where, orderBy, skip, take), toReportDto);
  }

  async get(c: ActorContext, id: string): Promise<ReportDetailDto> {
    return this.detail(c, await this.require(c, id));
  }

  // ---- create -------------------------------------------------------------------------------------------------

  /** A CSR reports about one of their own assigned clients. Any other client is a 404, the same as one that doesn't exist. */
  async create(c: ActorContext, dto: CreateReportDto): Promise<ReportDetailDto> {
    const client = await this.repo.findClient({ AND: [{ id: dto.clientId, role: "CLIENT" }, clientScope(c.actor)] });
    if (!client) throw new ResourceNotFoundException("client", dto.clientId);
    await this.access.assert(c.actor, "reportSend", { csr: client.clientProfile?.csrId ?? null }, c.requestId, client.clientProfile?.caseNumber ?? "");
    if (client.status === "REMOVED") throw new UserRemovedException(client.name);

    let caseId: string | null;
    if (dto.caseId) {
      const theCase = await this.repo.findCase(dto.caseId);
      if (!theCase) throw new ResourceNotFoundException("case", dto.caseId);
      if (theCase.clientId !== client.id) throw new CaseClientMismatchException(formatCaseDisplay(theCase.number), client.name);
      caseId = theCase.id;
    } else {
      caseId = (await this.repo.currentCaseOf(client.id))?.id ?? null;
    }

    const id = await this.repo.transaction(async (tx) => {
      const number = await this.counters.next("report", tx);
      const row = await this.repo.create(
        {
          number,
          clientId: client.id,
          csrId: c.actor.id,
          caseId,
          title: dto.title,
          body: dto.body,
          category: dto.category ?? "OTHER",
          priority: dto.priority ?? "NORMAL",
          action: dto.action ?? "",
          status: "SUBMITTED",
        },
        tx,
      );
      await this.repo.addEvent({ reportId: row.id, status: "SUBMITTED", byId: c.actor.id }, tx);
      const compliance = await this.repo.staffIds(["COMPLIANCE"], tx);
      await this.notifications.notify(tx, { userIds: compliance, text: `New CSR report ${displayReport(number)} from ${await this.actorName(c, tx)}`, link: "reports" });
      await this.record(c, `Submitted report “${dto.title}” (${displayReport(number)})`, client.clientProfile?.caseNumber ?? "", tx);
      return row.id;
    });
    return this.detail(c, await this.requireById(id));
  }

  // ---- thread -------------------------------------------------------------------------------------------------

  /**
   * A reply in the thread. The report's CSR and the staff who can see it may reply, until it is resolved. A CSR replying
   * to a clarification request sends the report back to Compliance as Submitted.
   */
  async reply(c: ActorContext, id: string, dto: ReportTextDto): Promise<ReportMessageDto> {
    const report = await this.require(c, id);
    await this.access.assert(c.actor, "reportView", { csr: report.csrId }, c.requestId, report.client.clientProfile?.caseNumber ?? "");
    if (report.status === "REVIEWED") throw new ReportClosedException(displayReport(report.number));

    const display = displayReport(report.number);
    const message = await this.repo.transaction(async (tx) => {
      // Resolved reports take no more replies, even if it was resolved a moment after we read it.
      if (!(await this.repo.touchIfOpen(report.id, tx))) throw new ReportClosedException(display);
      const created = await this.repo.addMessage({ reportId: report.id, authorId: c.actor.id, text: dto.text, isNote: false }, tx);
      if (c.actor.role === "CSR" && report.status === "CLARIFICATION_REQUESTED") {
        if (await this.repo.moveIfStatus(report.id, "CLARIFICATION_REQUESTED", "SUBMITTED", tx)) {
          await this.repo.addEvent({ reportId: report.id, status: "SUBMITTED", byId: c.actor.id }, tx);
        }
      }
      const name = await this.actorName(c, tx);
      const recipients = c.actor.role === "CSR" ? await this.repo.staffIds(["COMPLIANCE"], tx) : [report.csrId];
      await this.notifications.notify(tx, { userIds: recipients, text: `Reply on ${display} from ${name}`, link: "reports", excludeUserId: c.actor.id });
      await this.record(c, `Replied on ${display}`, report.client.clientProfile?.caseNumber ?? "", tx);
      return created;
    });
    return toMessageDto(message);
  }

  /** A Compliance-only note (Compliance writes it; Compliance, Manager and Admin read it; a CSR never gets it). */
  async addNote(c: ActorContext, id: string, dto: ReportTextDto): Promise<ReportMessageDto> {
    const report = await this.require(c, id);
    await this.access.assert(c.actor, "reportReview", undefined, c.requestId, report.client.clientProfile?.caseNumber ?? "");
    const note = await this.repo.transaction(async (tx) => {
      const created = await this.repo.addMessage({ reportId: report.id, authorId: c.actor.id, text: dto.text, isNote: true }, tx);
      await this.record(c, `Added compliance note on ${displayReport(report.number)}`, report.client.clientProfile?.caseNumber ?? "", tx);
      return created;
    });
    return toMessageDto(note);
  }

  // ---- status -------------------------------------------------------------------------------------------------

  /** Compliance acknowledges, asks for clarification or resolves. Every move is an event, an audit entry and a notification. */
  async setStatus(c: ActorContext, id: string, dto: SetReportStatusDto): Promise<ReportDetailDto> {
    const report = await this.require(c, id);
    await this.access.assert(c.actor, "reportReview", undefined, c.requestId, report.client.clientProfile?.caseNumber ?? "");

    const target: ReportStatus = dto.status;
    const display = displayReport(report.number);
    if (!NEXT_REPORT_STATUS[report.status].includes(target)) {
      const reason =
        report.status === "REVIEWED"
          ? "It was already resolved, and a resolved report is final."
          : report.status === target
            ? "It is already in that status."
            : "Reports move forward: Submitted, then Acknowledged, then Clarification requested or Resolved.";
      throw new InvalidStateTransitionException("report", REPORT_LABEL[report.status], REPORT_LABEL[target], reason);
    }

    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.moveIfStatus(report.id, report.status, target, tx))) throw new ConcurrentModificationException("report");
      await this.repo.addEvent({ reportId: report.id, status: target, byId: c.actor.id }, tx);
      const name = await this.actorName(c, tx);
      const text = target === "ACKNOWLEDGED" ? `${display} was acknowledged by ${name}` : `${display}: ${REPORT_LABEL[target]}`;
      await this.notifications.notify(tx, { userIds: [report.csrId], text, link: "reports", excludeUserId: c.actor.id });
      await this.record(c, `Marked ${display} ${REPORT_LABEL[target].toLowerCase()}`, report.client.clientProfile?.caseNumber ?? "", tx);
    });
    return this.detail(c, await this.requireById(report.id));
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  private async detail(c: ActorContext, report: ReportRecord): Promise<ReportDetailDto> {
    const [messages, events] = await Promise.all([
      this.repo.messages(report.id, NOTE_READERS.includes(c.actor.role)),
      this.repo.events(report.id),
    ]);
    return {
      ...toReportDto(report),
      messages: messages.map(toMessageDto),
      events: events.map((e) => ({ id: e.id, status: e.status, statusLabel: REPORT_LABEL[e.status], by: e.by, at: e.at })),
    };
  }

  /** A report the caller may see. Anything else, including another CSR's, is a 404. */
  private async require(c: ActorContext, id: string): Promise<ReportRecord> {
    const report = await this.repo.findOne({ AND: [{ id }, reportScope(c.actor)] });
    if (!report) throw new ResourceNotFoundException("report", id);
    return report;
  }

  private async requireById(id: string, db?: Db): Promise<ReportRecord> {
    const report = await this.repo.findById(id, db);
    if (!report) throw new ResourceNotFoundException("report", id);
    return report;
  }

  private async actorName(c: ActorContext, tx: Db): Promise<string> {
    return (await tx.user.findUnique({ where: { id: c.actor.id }, select: { name: true } }))?.name ?? "A colleague";
  }

  private record(c: ActorContext, action: string, target: string, tx: Db): Promise<void> {
    return this.audit.record({ actorId: c.actor.id, actorRole: c.actor.role, action, target, category: "reports", requestId: c.requestId, ipAddress: c.ipAddress }, tx);
  }
}
