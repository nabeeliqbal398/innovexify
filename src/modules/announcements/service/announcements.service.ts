import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import {
  AnnouncementAckNotRequiredException,
  AnnouncementAudienceInvalidException,
  AnnouncementExpiryPastException,
  AnnouncementNotDraftException,
  AnnouncementNotPublishedException,
  PermissionDeniedException,
  ResourceNotFoundException,
  ValidationFailedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { NotificationService, type EmailRecipient } from "../../../common/notifications/notification.service";
import { parseSort, windowOf } from "../../../common/pagination/paginate";
import { can } from "../../../common/permissions/permissions";
import { PaginatedResponse } from "../../../common/responses/api-response";
import { isoDay, todayUtc } from "../../../common/utils/dates";
import { dateOnly } from "../../../common/validators/iso-date";
import type { AckListDto, AnnouncementDto, CreateAnnouncementDto, ListAnnouncementsQueryDto, UpdateAnnouncementDto } from "../dto/announcements.dto";
import { AnnouncementsRepository, type AnnouncementRecord } from "../repository/announcements.repository";

type Db = Prisma.TransactionClient;

const SORT_FIELDS = ["createdAt", "publishedAt", "priority", "title"] as const;

/**
 * Announcements: staff with `announce` (Admin, Manager, Compliance) write them; clients read the published, unexpired ones
 * meant for them and acknowledge those that ask for it. A CSR reads published, unexpired ones too (what their clients see).
 * "Today" in every expiry judgement is the server's date, never one sent by the caller.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly repo: AnnouncementsRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // ---- reading ------------------------------------------------------------------------------------------------

  async list(c: ActorContext, query: ListAnnouncementsQueryDto): Promise<PaginatedResponse<AnnouncementDto>> {
    const sort = parseSort(query, SORT_FIELDS, c.actor.role === "CLIENT" ? { field: "publishedAt", order: "desc" } : { field: "createdAt", order: "desc" });
    const isStaff = c.actor.role !== "CLIENT";
    const where: Prisma.AnnouncementWhereInput = {
      AND: [
        this.visibleTo(c),
        ...(query.priority ? [{ priority: query.priority }] : []),
        // Filters on drafts and audiences are for staff; a client's list is already only published and theirs.
        ...(isStaff && query.status ? [{ status: query.status }] : []),
        ...(isStaff && query.audience ? [query.audience === "all" ? { audienceId: null } : { audienceId: query.audience }] : []),
      ],
    };
    const orderBy: Prisma.AnnouncementOrderByWithRelationInput[] = [
      sort.field === "publishedAt" ? { publishedAt: { sort: sort.order, nulls: "last" } } : { [sort.field]: sort.order },
      { id: "asc" },
    ];
    const { skip, take } = windowOf(query);
    const [rows, total] = await this.repo.page(where, orderBy, skip, take);
    return new PaginatedResponse(await this.present(c, rows), total, query.page, query.limit);
  }

  async get(c: ActorContext, id: string): Promise<AnnouncementDto> {
    const row = await this.require(c, id);
    return (await this.present(c, [row]))[0] as AnnouncementDto;
  }

  /** Who has acknowledged and who hasn't (staff). */
  async acks(c: ActorContext, id: string): Promise<AckListDto> {
    const row = await this.require(c, id);
    if (!row.requireAck) throw new AnnouncementAckNotRequiredException(row.title);
    const audience = row.audienceId ? await this.repo.findClient(row.audienceId) : null;
    const targets = row.audienceId
      ? audience
        ? [{ id: audience.id, name: audience.name, caseNumber: "" }]
        : []
      : (await this.repo.activeClients()).map((u) => ({ id: u.id, name: u.name, caseNumber: u.clientProfile?.caseNumber ?? "" }));
    const acks = new Map((await this.repo.acksOf(row.id)).map((a) => [a.userId, a.at]));
    const clients = targets.map((t) => ({ ...t, acknowledged: acks.has(t.id), at: acks.get(t.id) ?? null }));
    return { announcementId: row.id, acknowledged: clients.filter((x) => x.acknowledged).length, total: clients.length, clients };
  }

  // ---- writing (staff) ----------------------------------------------------------------------------------------

  async create(c: ActorContext, dto: CreateAnnouncementDto): Promise<AnnouncementDto> {
    const audienceId = await this.resolveAudience(dto.audience);
    if (dto.expiresAt) this.assertExpiry(dto.expiresAt);

    const publish = dto.publish === true;
    let emails: EmailRecipient[] = [];
    const id = await this.repo.transaction(async (tx) => {
      const created = await this.repo.create(
        {
          title: dto.title,
          message: dto.message,
          audienceId,
          priority: dto.priority ?? "NORMAL",
          status: publish ? "PUBLISHED" : "DRAFT",
          requireAck: dto.requireAck ?? false,
          createdById: c.actor.id,
          publishedAt: publish ? new Date() : null,
          expiresAt: dto.expiresAt ? dateOnly(dto.expiresAt) : null,
        },
        tx,
      );
      if (publish) emails = await this.notifyAudience(tx, audienceId, dto.title, c.actor.id);
      await this.record(c, `${publish ? "Published" : "Drafted"} announcement “${dto.title}”`, audienceId ? "One client" : "All clients", tx);
      return created.id;
    });
    await this.notifications.emailAfterCommit(emails, `Announcement: ${dto.title}`);
    return this.get(c, id);
  }

  /** Drafts only: once it is published clients may have read it, so it can't be changed behind their backs. */
  async update(c: ActorContext, id: string, dto: UpdateAnnouncementDto): Promise<AnnouncementDto> {
    const row = await this.require(c, id);
    if (row.status !== "DRAFT") throw new AnnouncementNotDraftException(row.title, row.status);
    const sent = (["title", "message", "audience", "priority", "expiresAt", "requireAck"] as const).filter((f) => dto[f] !== undefined);
    if (sent.length === 0) throw new ValidationFailedException([{ field: "body", message: "Send at least one field to change." }]);

    const data: Prisma.AnnouncementUncheckedUpdateManyInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.message !== undefined) data.message = dto.message;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.requireAck !== undefined) data.requireAck = dto.requireAck;
    if (dto.audience !== undefined) data.audienceId = await this.resolveAudience(dto.audience);
    if (dto.expiresAt !== undefined) {
      if (dto.expiresAt !== null) this.assertExpiry(dto.expiresAt);
      data.expiresAt = dto.expiresAt === null ? null : dateOnly(dto.expiresAt);
    }

    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.updateIfStatus(row.id, "DRAFT", data, tx))) {
        // Published (by someone else) between our read and our write.
        throw new AnnouncementNotDraftException(row.title, "PUBLISHED");
      }
      await this.record(c, `Edited draft announcement “${dto.title ?? row.title}”`, row.audienceId ? "One client" : "All clients", tx);
    });
    return this.get(c, id);
  }

  async publish(c: ActorContext, id: string): Promise<AnnouncementDto> {
    const row = await this.require(c, id);
    if (row.status !== "DRAFT") throw new AnnouncementNotDraftException(row.title, row.status);
    // A draft saved last week may carry an expiry that has passed since.
    if (row.expiresAt && (isoDay(row.expiresAt) as string) < (isoDay(todayUtc()) as string)) throw new AnnouncementExpiryPastException(isoDay(row.expiresAt) as string);
    if (row.audienceId) {
      const client = await this.repo.findClient(row.audienceId);
      if (!client || client.status !== "ACTIVE") throw new AnnouncementAudienceInvalidException(client ? "inactive" : "not-found");
    }

    let emails: EmailRecipient[] = [];
    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.updateIfStatus(row.id, "DRAFT", { status: "PUBLISHED", publishedAt: new Date() }, tx))) {
        throw new AnnouncementNotDraftException(row.title, "PUBLISHED");
      }
      emails = await this.notifyAudience(tx, row.audienceId, row.title, c.actor.id);
      await this.record(c, `Published announcement “${row.title}”`, row.audienceId ? "One client" : "All clients", tx);
    });
    await this.notifications.emailAfterCommit(emails, `Announcement: ${row.title}`);
    return this.get(c, id);
  }

  async archive(c: ActorContext, id: string): Promise<AnnouncementDto> {
    const row = await this.require(c, id);
    if (row.status !== "PUBLISHED") throw new AnnouncementNotPublishedException(row.title, row.status);
    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.updateIfStatus(row.id, "PUBLISHED", { status: "ARCHIVED" }, tx))) throw new AnnouncementNotPublishedException(row.title, "ARCHIVED");
      await this.record(c, `Archived announcement “${row.title}”`, row.audienceId ? "One client" : "All clients", tx);
    });
    return this.get(c, id);
  }

  // ---- acknowledging (client) ---------------------------------------------------------------------------------

  /** Idempotent: acknowledging twice keeps the first time and says so. Only for announcements the client can see. */
  async acknowledge(c: ActorContext, id: string): Promise<{ announcementId: string; acknowledged: true; at: Date; alreadyAcknowledged: boolean }> {
    if (c.actor.role !== "CLIENT") throw new PermissionDeniedException("Only clients acknowledge announcements.");
    const row = await this.require(c, id);
    if (!row.requireAck) throw new AnnouncementAckNotRequiredException(row.title);
    const created = await this.repo.transaction(async (tx) => {
      const isNew = await this.repo.acknowledge(row.id, c.actor.id, tx);
      if (isNew) await this.record(c, `Acknowledged announcement “${row.title}”`, row.title, tx);
      return isNew;
    });
    const ack = await this.repo.ackOf(row.id, c.actor.id);
    return { announcementId: row.id, acknowledged: true, at: ack?.at ?? new Date(), alreadyAcknowledged: !created };
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /**
   * Which announcements the caller may see. Staff with `announce`: all. Everyone else (a CSR, a client): published and not yet
   * expired by the server's date; a client additionally only those for everyone or for them.
   */
  private visibleTo(c: ActorContext): Prisma.AnnouncementWhereInput {
    if (can(c.actor, "announce")) return {};
    const today = todayUtc();
    const live: Prisma.AnnouncementWhereInput = { status: "PUBLISHED", OR: [{ expiresAt: null }, { expiresAt: { gte: today } }] };
    return c.actor.role === "CLIENT" ? { AND: [live, { OR: [{ audienceId: null }, { audienceId: c.actor.id }] }] } : live;
  }

  private async require(c: ActorContext, id: string): Promise<AnnouncementRecord> {
    const row = await this.repo.findOne({ AND: [{ id }, this.visibleTo(c)] });
    if (!row) throw new ResourceNotFoundException("announcement", id);
    return row;
  }

  /** "all" (or nothing) is everyone; otherwise one active client. */
  private async resolveAudience(audience: string | undefined): Promise<string | null> {
    if (audience === undefined || audience === "all") return null;
    const client = await this.repo.findClient(audience);
    if (!client) throw new AnnouncementAudienceInvalidException("not-found");
    if (client.status !== "ACTIVE") throw new AnnouncementAudienceInvalidException("inactive");
    return client.id;
  }

  private assertExpiry(expiresAt: string): void {
    if (expiresAt < (isoDay(todayUtc()) as string)) throw new AnnouncementExpiryPastException(expiresAt);
  }

  private async notifyAudience(tx: Db, audienceId: string | null, title: string, actorId: string): Promise<EmailRecipient[]> {
    const ids = audienceId ? [audienceId] : (await this.repo.activeClients(tx)).map((u) => u.id);
    return this.notifications.notify(tx, { userIds: ids, text: `Announcement: ${title}`, link: "home", category: "ANNOUNCEMENTS", excludeUserId: actorId });
  }

  /** Maps rows to the role's view. A client gets no status, audience, author or counts; staff don't get "acknowledged". */
  private async present(c: ActorContext, rows: AnnouncementRecord[]): Promise<AnnouncementDto[]> {
    const base = (r: AnnouncementRecord): AnnouncementDto => ({
      id: r.id,
      title: r.title,
      message: r.message,
      priority: r.priority,
      publishedAt: r.publishedAt,
      expiresAt: isoDay(r.expiresAt),
      requireAck: r.requireAck,
    });
    if (c.actor.role === "CLIENT") {
      const mine = new Map((await this.repo.acksFor(c.actor.id, rows.map((r) => r.id))).map((a) => [a.announcementId, a.at]));
      return rows.map((r) => ({ ...base(r), acknowledged: mine.has(r.id), acknowledgedAt: mine.get(r.id) ?? null }));
    }
    const wantsAcks = rows.filter((r) => r.requireAck);
    const [counts, everyone] = await Promise.all([
      this.repo.ackCounts(wantsAcks.map((r) => r.id)),
      wantsAcks.some((r) => !r.audienceId) ? this.repo.activeClientCount() : Promise.resolve(0),
    ]);
    return rows.map((r) => ({
      ...base(r),
      status: r.status,
      audience: r.audience ? { type: "client" as const, id: r.audience.id, name: r.audience.name } : { type: "all" as const },
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      acks: r.requireAck ? { acknowledged: counts.get(r.id) ?? 0, total: r.audienceId ? 1 : everyone } : null,
    }));
  }

  private record(c: ActorContext, action: string, target: string, tx: Db): Promise<void> {
    return this.audit.record(
      { actorId: c.actor.id, actorRole: c.actor.role, action, target, category: "announcements", requestId: c.requestId, ipAddress: c.ipAddress },
      tx,
    );
  }
}
