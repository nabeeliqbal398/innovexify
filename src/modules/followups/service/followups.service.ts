import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import {
  FollowUpDateInPastException,
  FollowUpDoneException,
  FollowUpOutcomeRequiredException,
  ResourceNotFoundException,
  UserRemovedException,
  ValidationFailedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { paginate, parseSort } from "../../../common/pagination/paginate";
import type { PaginatedResponse } from "../../../common/responses/api-response";
import { clientScope, followUpScope } from "../../../common/scope/scope";
import { isoDay, todayUtc } from "../../../common/utils/dates";
import { dateOnly } from "../../../common/validators/iso-date";
import type {
  CompleteFollowUpDto,
  CreateFollowUpDto,
  CreateInteractionDto,
  FollowUpDto,
  InteractionDto,
  ListFollowUpsQueryDto,
  ListInteractionsQueryDto,
  UpdateFollowUpDto,
} from "../dto/followups.dto";
import { FollowUpsRepository, type ClientForFollowUp, type FollowUpRecord, type InteractionRecord } from "../repository/followups.repository";

type Db = Prisma.TransactionClient;

const SORT_FIELDS = ["due", "createdAt", "status"] as const;
const KIND_LABEL = { CALL: "call", EMAIL: "email", PORTAL_MESSAGE: "portal message", MEETING: "meeting" } as const;

export function toFollowUpDto(f: FollowUpRecord, today: Date = todayUtc()): FollowUpDto {
  return {
    id: f.id,
    client: { id: f.client.id, name: f.client.name, caseNumber: f.client.clientProfile?.caseNumber ?? "" },
    csr: f.csr,
    type: f.type,
    due: isoDay(f.due) ?? "",
    status: f.status,
    note: f.note,
    outcome: f.outcome,
    doneAt: f.doneAt,
    overdue: f.status === "OPEN" && f.due.getTime() < today.getTime(),
    createdAt: f.createdAt,
  };
}

const toInteractionDto = (i: InteractionRecord): InteractionDto => ({ id: i.id, kind: i.kind, text: i.text, by: i.by, at: i.at });

/**
 * Follow-ups (what a CSR has promised to do for a client, and when) and interactions (what has been said). Both are for
 * the client's CSR, Manager and Admin (`followups`): Compliance and clients have no access, and a CSR never sees a
 * colleague's.
 */
@Injectable()
export class FollowUpsService {
  constructor(
    private readonly repo: FollowUpsRepository,
    private readonly audit: AuditService,
  ) {}

  // ---- follow-ups ---------------------------------------------------------------------------------------------

  async list(c: ActorContext, query: ListFollowUpsQueryDto): Promise<PaginatedResponse<FollowUpDto>> {
    const sort = parseSort(query, SORT_FIELDS, { field: "due", order: "asc" });
    const today = todayUtc();
    const when: Prisma.FollowUpWhereInput[] = [];
    if (query.filter === "overdue") when.push({ status: "OPEN", due: { lt: today } });
    if (query.filter === "today") when.push({ status: "OPEN", due: today });
    if (query.filter === "upcoming") when.push({ status: "OPEN", due: { gt: today } });

    const where: Prisma.FollowUpWhereInput = {
      AND: [
        followUpScope(c.actor),
        // Whoever the client currently belongs to is irrelevant: a CSR sees follow-ups that are theirs.
        { client: { is: { deletedAt: null } } },
        ...when,
        ...(query.csrId ? [{ csrId: query.csrId }] : []),
        ...(query.clientId ? [{ clientId: query.clientId }] : []),
        ...(query.status ? [{ status: query.status }] : []),
      ],
    };
    const orderBy: Prisma.FollowUpOrderByWithRelationInput[] = [{ [sort.field]: sort.order }, { id: "asc" }];
    return paginate(query, ({ skip, take }) => this.repo.page(where, orderBy, skip, take), (f) => toFollowUpDto(f, today));
  }

  async create(c: ActorContext, dto: CreateFollowUpDto): Promise<FollowUpDto> {
    const client = await this.requireClient(c, dto.clientId);
    if (client.status === "REMOVED") throw new UserRemovedException(client.name);
    if (dto.due < isoDay(todayUtc())!) throw new FollowUpDateInPastException();

    // The follow-up belongs to the client's CSR, so it lands on their list even when a Manager creates it.
    const csrId = client.clientProfile?.csrId ?? c.actor.id;
    const created = await this.repo.transaction(async (tx) => {
      const row = await this.repo.create({ clientId: client.id, csrId, type: dto.type, due: dateOnly(dto.due), note: dto.note }, tx);
      await this.record(c, `Added follow-up for ${client.name}`, client, tx);
      return row;
    });
    return toFollowUpDto(await this.requireById(created.id));
  }

  async update(c: ActorContext, id: string, dto: UpdateFollowUpDto): Promise<FollowUpDto> {
    const followUp = await this.require(c, id);
    if (followUp.status === "DONE") throw new FollowUpDoneException("edit");
    if (dto.type === undefined && dto.due === undefined && dto.note === undefined) {
      throw new ValidationFailedException([{ field: "body", message: "Send at least one field to change." }]);
    }
    const data: Prisma.FollowUpUncheckedUpdateInput = {};
    const changes: string[] = [];
    if (dto.type !== undefined && dto.type !== followUp.type) {
      data.type = dto.type;
      changes.push(`type ${KIND_LABEL[dto.type]}`);
    }
    if (dto.due !== undefined && dto.due !== isoDay(followUp.due)) {
      // Keeping an old date is fine; moving a follow-up to a date that has already passed is not.
      if (dto.due < isoDay(todayUtc())!) throw new FollowUpDateInPastException();
      data.due = dateOnly(dto.due);
      changes.push(`due ${dto.due}`);
    }
    if (dto.note !== undefined && dto.note !== followUp.note) {
      data.note = dto.note;
      changes.push("note");
    }
    if (changes.length === 0) return toFollowUpDto(followUp);

    await this.repo.transaction(async (tx) => {
      // The row may have been completed between the read and now.
      const open = await tx.followUp.updateMany({ where: { id: followUp.id, status: "OPEN" }, data });
      if (open.count !== 1) throw new FollowUpDoneException("edit");
      await this.record(c, `Edited follow-up for ${followUp.client.name} (${changes.join(", ")})`, followUp.client, tx);
    });
    return toFollowUpDto(await this.requireById(followUp.id));
  }

  /** Done = an outcome, recorded on the follow-up AND written to the client's timeline as an interaction, in one transaction. */
  async complete(c: ActorContext, id: string, dto: CompleteFollowUpDto): Promise<FollowUpDto> {
    const followUp = await this.require(c, id);
    const outcome = dto.outcome?.trim() ?? "";
    if (!outcome) throw new FollowUpOutcomeRequiredException();
    if (followUp.status === "DONE") throw new FollowUpDoneException("complete");

    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.markDone(followUp.id, outcome, tx))) throw new FollowUpDoneException("complete");
      await this.repo.addInteraction({ clientId: followUp.clientId, byId: c.actor.id, kind: followUp.type, text: outcome }, tx);
      await this.record(c, `Completed follow-up with ${followUp.client.name}`, followUp.client, tx);
    });
    return toFollowUpDto(await this.requireById(followUp.id));
  }

  async remove(c: ActorContext, id: string): Promise<FollowUpDto> {
    const followUp = await this.require(c, id);
    if (followUp.status === "DONE") throw new FollowUpDoneException("delete");
    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.removeIfOpen(followUp.id, tx))) throw new FollowUpDoneException("delete");
      await this.record(c, `Deleted follow-up for ${followUp.client.name}`, followUp.client, tx);
    });
    return toFollowUpDto(followUp);
  }

  // ---- interactions -------------------------------------------------------------------------------------------

  async listInteractions(c: ActorContext, clientId: string, query: ListInteractionsQueryDto): Promise<PaginatedResponse<InteractionDto>> {
    const client = await this.requireClient(c, clientId);
    parseSort(query, ["at"], { field: "at", order: "desc" });
    const order = query.order ?? "desc";
    return paginate(query, ({ skip, take }) => this.repo.interactionPage(client.id, order, skip, take), toInteractionDto);
  }

  async addInteraction(c: ActorContext, clientId: string, dto: CreateInteractionDto): Promise<InteractionDto> {
    const client = await this.requireClient(c, clientId);
    if (client.status === "REMOVED") throw new UserRemovedException(client.name);
    return toInteractionDto(
      await this.repo.transaction(async (tx) => {
        const row = await this.repo.addInteraction({ clientId: client.id, byId: c.actor.id, kind: dto.kind, text: dto.text }, tx);
        await this.record(c, `Recorded ${KIND_LABEL[dto.kind]} with ${client.name}`, client, tx);
        return row;
      }),
    );
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /** A follow-up that is the caller's to see. Anything else is a 404. */
  private async require(c: ActorContext, id: string): Promise<FollowUpRecord> {
    const row = await this.repo.findOne({ AND: [{ id }, followUpScope(c.actor)] });
    if (!row) throw new ResourceNotFoundException("follow-up", id);
    return row;
  }

  private async requireById(id: string, db?: Db): Promise<FollowUpRecord> {
    const row = await this.repo.findById(id, db);
    if (!row) throw new ResourceNotFoundException("follow-up", id);
    return row;
  }

  /** A client in the caller's scope (a CSR: their own; Admin and Manager: any, removed ones included). */
  private async requireClient(c: ActorContext, id: string): Promise<ClientForFollowUp> {
    const client = await this.repo.findClient({ AND: [{ id, role: "CLIENT" }, clientScope(c.actor, { includeRemoved: true })] });
    if (!client) throw new ResourceNotFoundException("client", id);
    return client;
  }

  private record(c: ActorContext, action: string, client: Pick<ClientForFollowUp, "clientProfile">, tx: Db): Promise<void> {
    return this.audit.record(
      { actorId: c.actor.id, actorRole: c.actor.role, action, target: client.clientProfile?.caseNumber ?? "", category: "cases", requestId: c.requestId, ipAddress: c.ipAddress },
      tx,
    );
  }
}
