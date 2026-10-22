import { Injectable } from "@nestjs/common";
import { Prisma, type NoteVisibility } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import { CounterService, formatCaseDisplay } from "../../../common/counter/counter.service";
import {
  CaseAlreadyExistsException,
  CaseCompletedException,
  CaseDeletedException,
  ConcurrentModificationException,
  FilingNumberRequiredException,
  InvalidCaseOwnerException,
  InvalidStateTransitionException,
  ResourceNotFoundException,
  RollbackReasonRequiredException,
  ServiceInactiveException,
  UserRemovedException,
  ValidationFailedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { NotificationService } from "../../../common/notifications/notification.service";
import { paginate, parseSort } from "../../../common/pagination/paginate";
import { AccessService } from "../../../common/permissions/access.service";
import { can } from "../../../common/permissions/permissions";
import type { PaginatedResponse } from "../../../common/responses/api-response";
import { caseScope, clientScope } from "../../../common/scope/scope";
import { dateOnly, formatDateOnly } from "../../../common/validators/iso-date";
import type {
  AddNoteDto,
  CaseDetailDto,
  CaseDto,
  CaseEventDto,
  CaseNoteDto,
  CreateCaseDto,
  EventsQueryDto,
  ListCasesQueryDto,
  MoveStageDto,
  UpdateCaseDto,
} from "../dto/cases.dto";
import { CASE_SORT_FIELDS, type CaseRecord, type EventRecord, type NoteRecord } from "../interfaces/cases.interfaces";
import {
  classifyMove,
  EDITABLE_STATUSES,
  isLastStage,
  nextStage,
  needsFilingNumber,
  PRIORITY_LABEL,
  stageIndex,
  STAGE_LABEL,
  STATUS_LABEL,
  statusAfterMove,
} from "../interfaces/case-rules";
import { CasesRepository, type CaseChange } from "../repository/cases.repository";

type Db = Prisma.TransactionClient;

const caseNumberOf = (rec: CaseRecord): string => rec.client.clientProfile?.caseNumber ?? "";
const displayOf = (rec: CaseRecord): string => formatCaseDisplay(rec.number);

export function toCaseDto(rec: CaseRecord): CaseDto {
  const profile = rec.client.clientProfile;
  return {
    id: rec.id,
    number: rec.number,
    displayNumber: displayOf(rec),
    version: rec.version,
    stage: rec.stage,
    status: rec.status,
    priority: rec.priority,
    deadline: formatDateOnly(rec.deadline),
    filingConfirmation: rec.filingConfirmation,
    service: rec.service,
    client: {
      id: rec.client.id,
      name: rec.client.name,
      email: rec.client.email,
      caseNumber: profile?.caseNumber ?? "",
      businessName: profile?.businessName ?? "",
      formationState: profile?.formationState ?? "",
    },
    owner: rec.owner,
    completedAt: rec.completedAt,
    lastActivityAt: rec.lastActivityAt,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    deletedAt: rec.deletedAt,
  };
}

const toNoteDto = (note: NoteRecord): CaseNoteDto => ({
  id: note.id,
  caseId: note.caseId,
  visibility: note.visibility,
  text: note.text,
  author: note.author,
  createdAt: note.createdAt,
});

/** Staff see the whole timeline. A client sees which stage the case reached and when, not who moved it or why. */
const toEventDto = (event: EventRecord, forClient: boolean): CaseEventDto =>
  forClient ? { id: event.id, toStage: event.toStage, at: event.at } : { id: event.id, toStage: event.toStage, note: event.note, by: event.by, at: event.at };

const todayUtc = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

@Injectable()
export class CasesService {
  constructor(
    private readonly repo: CasesRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly counters: CounterService,
    private readonly notifications: NotificationService,
  ) {}

  // ---- reads --------------------------------------------------------------------------------------------------

  async list(c: ActorContext, query: ListCasesQueryDto): Promise<PaginatedResponse<CaseDto>> {
    if (query.deadlineFrom && query.deadlineTo && query.deadlineFrom > query.deadlineTo) {
      throw new ValidationFailedException([{ field: "deadlineTo", message: "deadlineTo can't be before deadlineFrom." }]);
    }
    const sort = parseSort(query, CASE_SORT_FIELDS, { field: "lastActivityAt", order: "desc" });
    const search = query.search?.trim();
    const number = search ? /^(?:prj-?)?(\d{1,9})$/i.exec(search)?.[1] : undefined;

    const where: Prisma.CaseWhereInput = {
      AND: [
        caseScope(c.actor),
        ...(query.stage ? [{ stage: query.stage }] : []),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.priority ? [{ priority: query.priority }] : []),
        ...(query.ownerId ? [{ ownerId: query.ownerId === "none" ? null : query.ownerId }] : []),
        ...(query.clientId ? [{ clientId: query.clientId }] : []),
        ...(query.serviceId ? [{ serviceId: query.serviceId }] : []),
        ...(query.deadlineFrom || query.deadlineTo
          ? [{ deadline: { ...(query.deadlineFrom ? { gte: dateOnly(query.deadlineFrom) } : {}), ...(query.deadlineTo ? { lte: dateOnly(query.deadlineTo) } : {}) } }]
          : []),
        ...(search
          ? [
              {
                OR: [
                  ...(number ? [{ number: Number(number) }] : []),
                  { client: { is: { name: { contains: search, mode: "insensitive" as const } } } },
                  { client: { is: { email: { contains: search, mode: "insensitive" as const } } } },
                  { client: { is: { clientProfile: { is: { businessName: { contains: search, mode: "insensitive" as const } } } } } },
                  { client: { is: { clientProfile: { is: { caseNumber: { contains: search, mode: "insensitive" as const } } } } } },
                  { service: { is: { name: { contains: search, mode: "insensitive" as const } } } },
                ],
              },
            ]
          : []),
      ],
    };
    // A null deadline sorts last in either direction, so "soonest first" doesn't open with the cases that have none.
    const primary: Prisma.CaseOrderByWithRelationInput =
      sort.field === "deadline" ? { deadline: { sort: sort.order, nulls: "last" } } : { [sort.field]: sort.order };
    return paginate(query, ({ skip, take }) => this.repo.page(where, [primary, { id: "asc" }], skip, take), toCaseDto);
  }

  async get(c: ActorContext, id: string): Promise<CaseDetailDto> {
    return this.detail(c, await this.require(c, id));
  }

  async events(c: ActorContext, id: string, query: EventsQueryDto): Promise<PaginatedResponse<CaseEventDto>> {
    const rec = await this.require(c, id);
    const forClient = c.actor.role === "CLIENT";
    parseSort(query, ["at"], { field: "at", order: "asc" });
    const order = query.order ?? "asc";
    const where: Prisma.CaseEventWhereInput = forClient ? { toStage: { not: null } } : {};
    return paginate(query, ({ skip, take }) => this.repo.eventPage(rec.id, where, order, skip, take), (event) => toEventDto(event, forClient));
  }

  // ---- create -------------------------------------------------------------------------------------------------

  async create(c: ActorContext, dto: CreateCaseDto): Promise<CaseDto> {
    await this.access.assert(c.actor, "editCase", undefined, c.requestId);

    // Same answer for "no such client" and "not yours": nobody can probe for client ids.
    const found = await this.repo.findClient({ AND: [{ id: dto.clientId, role: "CLIENT" }, clientScope(c.actor, { includeRemoved: true })] });
    if (!found) throw new ResourceNotFoundException("client", dto.clientId);
    if (found.status === "REMOVED" || found.deletedAt) throw new UserRemovedException(found.name);
    const clientCaseNumber = found.clientProfile?.caseNumber ?? "";
    if (await this.repo.openCaseOf(found.id)) throw new CaseAlreadyExistsException(clientCaseNumber);

    const service = await this.repo.findService(dto.serviceId);
    if (!service) throw new ValidationFailedException([{ field: "serviceId", message: `We couldn't find the service "${dto.serviceId}". Choose one from the service catalog.` }]);
    if (!service.active) throw new ServiceInactiveException(service.name);

    // A client who has already accepted starts at onboarding; one who hasn't starts at the invitation (cases.ts createCase).
    const stage = found.status === "ACTIVE" ? "CLIENT_ONBOARDING" : "INVITATION_SENT";
    const { id, recipients, label } = await this.repo.transaction(async (tx) => {
      const number = await this.counters.next("case", tx);
      const created = await this.repo.create({ number, clientId: found.id, serviceId: service.id, stage, priority: dto.priority ?? "NORMAL", deadline: dateOnly(dto.deadline), byId: c.actor.id }, tx);
      if (dto.businessName !== undefined || dto.formationState !== undefined) {
        await this.repo.updateClientProfile(found.id, { businessName: dto.businessName, formationState: dto.formationState }, tx);
      }
      const display = formatCaseDisplay(number);
      const toClient = await this.notifications.notify(tx, { userIds: [found.id], text: `Your ${service.name} was opened`, link: "home", category: "STAGE", excludeUserId: c.actor.id });
      await this.notifications.notify(tx, { userIds: [found.clientProfile?.csrId], text: `New case ${display} for ${found.name}`, link: "projects", excludeUserId: c.actor.id });
      await this.record(c, `Created case ${display} for ${found.name}`, clientCaseNumber, tx);
      return { id: created.id, recipients: toClient, label: service.name };
    });
    await this.notifications.emailAfterCommit(recipients, `Your ${label} was opened`);
    return toCaseDto(await this.requireById(id));
  }

  // ---- edits --------------------------------------------------------------------------------------------------

  /** Priority, target date, compliance owner, service and (hold/block) status. Stage moves have their own route. */
  async update(c: ActorContext, id: string, dto: UpdateCaseDto): Promise<CaseDto> {
    const rec = await this.require(c, id);
    await this.access.assert(c.actor, "editCase", undefined, c.requestId, caseNumberOf(rec));
    this.assertEditable(rec);
    this.assertVersion(rec, dto.version);

    const sent = (["priority", "deadline", "ownerId", "serviceId", "status"] as const).filter((f) => dto[f] !== undefined);
    if (sent.length === 0) throw new ValidationFailedException([{ field: "body", message: "Send at least one field to change." }]);

    const change: CaseChange = {};
    const notes: string[] = [];

    if (dto.priority !== undefined && dto.priority !== rec.priority) {
      change.priority = dto.priority;
      notes.push(`priority → ${PRIORITY_LABEL[dto.priority]}`);
    }
    if (dto.deadline !== undefined && dto.deadline !== formatDateOnly(rec.deadline)) {
      change.deadline = dto.deadline === null ? null : dateOnly(dto.deadline);
      notes.push(`target date → ${dto.deadline ?? "none"}`);
    }
    if (dto.status !== undefined && dto.status !== rec.status) {
      if (!EDITABLE_STATUSES.includes(dto.status)) {
        throw new ValidationFailedException([{ field: "status", message: "A case becomes Completed by moving it to the Completed stage." }]);
      }
      change.status = dto.status;
      notes.push(`status ${STATUS_LABEL[rec.status]} → ${STATUS_LABEL[dto.status]}`);
    }
    let newOwner: string | null = null;
    if (dto.ownerId !== undefined && dto.ownerId !== rec.ownerId) {
      if (dto.ownerId === null) {
        notes.push("compliance owner → none");
      } else {
        const owner = await this.repo.findStaff(dto.ownerId);
        if (!owner || owner.role !== "COMPLIANCE" || owner.status !== "ACTIVE") throw new InvalidCaseOwnerException();
        newOwner = owner.id;
        notes.push(`compliance owner → ${owner.name}`);
      }
      change.ownerId = dto.ownerId;
    }
    if (dto.serviceId !== undefined && dto.serviceId !== rec.serviceId) {
      const service = await this.repo.findService(dto.serviceId);
      if (!service) throw new ValidationFailedException([{ field: "serviceId", message: `We couldn't find the service "${dto.serviceId}". Choose one from the service catalog.` }]);
      if (!service.active) throw new ServiceInactiveException(service.name);
      change.serviceId = service.id;
      notes.push(`service → ${service.name}`);
    }
    if (notes.length === 0) return toCaseDto(rec);

    const updated = await this.repo.transaction(async (tx) => {
      if (!(await this.repo.updateIfVersion(rec.id, dto.version, change, tx))) throw new ConcurrentModificationException("case");
      await this.repo.addEvent({ caseId: rec.id, toStage: null, byId: c.actor.id, note: `Updated ${notes.join(", ")}`.slice(0, 500) }, tx);
      if (newOwner) {
        await this.notifications.notify(tx, { userIds: [newOwner], text: `You now own compliance for ${displayOf(rec)}`, link: "clients", excludeUserId: c.actor.id });
      }
      await this.record(c, `Updated case ${displayOf(rec)} (${notes.join(", ")})`, caseNumberOf(rec), tx);
      return this.requireById(rec.id, tx);
    });
    return toCaseDto(updated);
  }

  /**
   * Moves a case one stage forward, or, with a reason and the right to roll back, one or more stages back.
   * Everything below happens in one transaction: the version-guarded update, the timeline event, the in-app
   * notifications and the audit entry. Emails go out after the commit.
   */
  async changeStage(c: ActorContext, id: string, dto: MoveStageDto): Promise<CaseDto> {
    const rec = await this.require(c, id);
    const target = dto.targetStage;
    await this.access.assert(c.actor, "complianceMilestones", { target, current: rec.stage }, c.requestId, caseNumberOf(rec));
    this.assertEditable(rec);
    this.assertVersion(rec, dto.version);

    const from = STAGE_LABEL[rec.stage];
    const to = STAGE_LABEL[target];
    const kind = classifyMove(rec.stage, target);
    const note = dto.note?.trim() ?? "";

    if (kind === "same") throw new InvalidStateTransitionException("case", from, to, "It is already in that stage.");
    if (kind === "skip") {
      const next = nextStage(rec.stage);
      throw new InvalidStateTransitionException("case", from, to, `Stages are completed in order, so the next one is "${next ? STAGE_LABEL[next] : to}".`);
    }
    if (kind === "backward") {
      if (!can(c.actor, "rollbackStage")) {
        throw new InvalidStateTransitionException("case", from, to, "A case only moves forward. Ask an Admin or Manager to roll it back, with a reason.");
      }
      if (note.length === 0) throw new RollbackReasonRequiredException(from, to);
    }

    const filing = dto.filingConfirmation?.trim() ?? "";
    const needFiling = kind === "next" && needsFilingNumber(rec.stage, target, rec.filingConfirmation);
    if (needFiling && !filing) throw new FilingNumberRequiredException();

    const idx = stageIndex(target);
    const now = new Date();
    const change: CaseChange = {
      stage: target,
      status: statusAfterMove(rec.status, idx),
      filingConfirmation: needFiling ? filing : rec.filingConfirmation,
      completedAt: isLastStage(target) ? now : rec.completedAt,
    };
    const eventNote = [needFiling ? `State confirmation ${filing}` : "", kind === "backward" ? `Rolled back: ${note}` : note].filter(Boolean).join(" · ");

    const clientText = `Your formation moved to “${to}”`;
    const { updated, clientEmail, ownerEmail } = await this.repo.transaction(async (tx) => {
      if (!(await this.repo.updateIfVersion(rec.id, dto.version, change, tx))) throw new ConcurrentModificationException("case");
      await this.repo.addEvent({ caseId: rec.id, toStage: target, byId: c.actor.id, note: eventNote.slice(0, 500) }, tx);
      const clientRecipients = await this.notifications.notify(tx, { userIds: [rec.clientId], text: clientText, link: "home", category: "STAGE", excludeUserId: c.actor.id });
      const ownerRecipients = await this.notifications.notify(tx, {
        userIds: [rec.ownerId],
        text: `${displayOf(rec)} moved to “${to}”`,
        link: "projects",
        category: "STAGE",
        excludeUserId: c.actor.id,
      });
      await this.record(c, `${kind === "backward" ? "Rolled back" : "Moved"} ${displayOf(rec)} from ${from} to ${to}${kind === "backward" ? ` · reason: ${note}` : ""}`, caseNumberOf(rec), tx);
      return { updated: await this.requireById(rec.id, tx), clientEmail: clientRecipients, ownerEmail: ownerRecipients };
    });

    await this.notifications.emailAfterCommit(clientEmail, clientText);
    await this.notifications.emailAfterCommit(ownerEmail, `${displayOf(rec)} moved to “${to}”`);
    return toCaseDto(updated);
  }

  /** Notes are the one thing a completed case still accepts. A removed case accepts nothing. */
  async addNote(c: ActorContext, id: string, dto: AddNoteDto): Promise<CaseNoteDto> {
    const rec = await this.require(c, id);
    const visibility: NoteVisibility = dto.visibility ?? "STAFF";
    await this.access.assert(c.actor, "caseNotes", { csr: rec.client.clientProfile?.csrId ?? null }, c.requestId, caseNumberOf(rec));
    if (visibility === "COMPLIANCE") await this.access.assert(c.actor, "caseNotesCompliance", undefined, c.requestId, caseNumberOf(rec));
    if (rec.deletedAt) throw new CaseDeletedException(displayOf(rec));

    const note = await this.repo.transaction(async (tx) => {
      const created = await this.repo.addNote({ caseId: rec.id, authorId: c.actor.id, visibility, text: dto.text }, tx);
      await this.repo.touch(rec.id, tx);
      await this.record(c, `Added ${visibility === "COMPLIANCE" ? "Compliance-only" : "internal"} note on ${displayOf(rec)}`, caseNumberOf(rec), tx);
      return created;
    });
    return toNoteDto(note);
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /** A case the caller may see. A case that exists but isn't theirs is a 404, the same as one that doesn't exist. */
  private async require(c: ActorContext, id: string): Promise<CaseRecord> {
    const rec = await this.repo.findOne({ AND: [{ id }, caseScope(c.actor, { includeRemoved: true })] });
    if (!rec) throw new ResourceNotFoundException("case", id);
    return rec;
  }

  private async requireById(id: string, db?: Db): Promise<CaseRecord> {
    const rec = await this.repo.findById(id, db);
    if (!rec) throw new ResourceNotFoundException("case", id);
    return rec;
  }

  private assertEditable(rec: CaseRecord): void {
    if (rec.deletedAt) throw new CaseDeletedException(displayOf(rec));
    if (rec.stage === "COMPLETED") throw new CaseCompletedException(displayOf(rec));
  }

  private assertVersion(rec: CaseRecord, version: number): void {
    if (rec.version !== version) throw new ConcurrentModificationException("case");
  }

  private async detail(c: ActorContext, rec: CaseRecord): Promise<CaseDetailDto> {
    const forClient = c.actor.role === "CLIENT";
    const visibilities: NoteVisibility[] = [];
    // Who reads which note comes from the permission table, so the list and the write rules can't drift apart.
    if (can(c.actor, "caseNotes")) visibilities.push("STAFF");
    if (can(c.actor, "caseNotesCompliance")) visibilities.push("COMPLIANCE");

    const [events, notes, filings, tasks] = await Promise.all([
      this.repo.events(rec.id, forClient ? { toStage: { not: null } } : {}),
      this.repo.notes(rec.id, visibilities),
      can(c.actor, "filingTracker") ? this.repo.filings(rec.id) : Promise.resolve(null),
      this.repo.taskCounts(rec.id, forClient, todayUtc()),
    ]);
    return {
      ...toCaseDto(rec),
      events: events.map((e) => toEventDto(e, forClient)),
      notes: notes.map(toNoteDto),
      filings: filings?.map((f) => ({
        id: f.id,
        number: f.number,
        displayNumber: `FIL-${f.number}`,
        type: f.type,
        status: f.status,
        submittedOn: formatDateOnly(f.submittedOn),
        reference: f.reference,
        nextAction: f.nextAction,
        nextActionDate: formatDateOnly(f.nextActionDate),
      })) ?? null,
      tasks,
    };
  }

  private record(c: ActorContext, action: string, target: string, tx: Db): Promise<void> {
    return this.audit.record({ actorId: c.actor.id, actorRole: c.actor.role, action, target, category: "cases", requestId: c.requestId, ipAddress: c.ipAddress }, tx);
  }
}
