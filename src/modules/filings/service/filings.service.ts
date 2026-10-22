import { Injectable } from "@nestjs/common";
import type { FilingStatus, Prisma } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import { CounterService, formatCaseDisplay } from "../../../common/counter/counter.service";
import {
  CaseCompletedException,
  CaseDeletedException,
  ConcurrentModificationException,
  FilingDateInFutureException,
  FilingNumberRequiredException,
  FilingReasonRequiredException,
  FilingSubmissionDateRequiredException,
  InvalidStateTransitionException,
  ResourceNotFoundException,
  ValidationFailedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { paginate, parseSort, windowOf } from "../../../common/pagination/paginate";
import { AccessService } from "../../../common/permissions/access.service";
import { PaginatedResponse } from "../../../common/responses/api-response";
import { caseScope } from "../../../common/scope/scope";
import { isoDay, todayUtc } from "../../../common/utils/dates";
import { dateOnly } from "../../../common/validators/iso-date";
import {
  ILLUSTRATIVE_NOTE,
  type CreateFilingDto,
  type CreateReminderDto,
  type FilingDto,
  type ListFilingsQueryDto,
  type ListRemindersQueryDto,
  type ReminderDto,
  type UpdateFilingDto,
} from "../dto/filings.dto";
import { classifyFilingMove, FILING_LABEL, isLate, NEEDS_SUBMISSION_DATE, outcomeFor } from "../interfaces/filing-rules";
import { FILING_SORT_FIELDS, type FilingRecord, type ReminderRecord } from "../interfaces/filings.interfaces";
import { FilingsRepository, type CaseForFiling } from "../repository/filings.repository";

type Db = Prisma.TransactionClient;

export const displayFiling = (number: number): string => `FIL-${number}`;

export function toFilingDto(f: FilingRecord, today: Date = todayUtc()): FilingDto {
  return {
    id: f.id,
    number: f.number,
    displayNumber: displayFiling(f.number),
    case: { id: f.case.id, displayNumber: formatCaseDisplay(f.case.number), client: { id: f.case.client.id, name: f.case.client.name } },
    type: f.type,
    status: f.status,
    submittedOn: isoDay(f.submittedOn),
    reference: f.reference,
    nextAction: f.nextAction,
    nextActionDate: isoDay(f.nextActionDate),
    outcome: f.outcome,
    late: isLate(f.nextActionDate, f.status, today),
    updatedAt: f.updatedAt,
  };
}

const toReminderDto = (r: ReminderRecord): ReminderDto => ({ id: r.id, title: r.title, date: isoDay(r.date) ?? "", kind: r.kind, illustrative: true, note: ILLUSTRATIVE_NOTE });

/** What a filing would look like after a change: the rules are applied to this, not to the half-merged request. */
interface FilingState {
  status: FilingStatus;
  submittedOn: string | null;
  reference: string;
}

/**
 * The state filing tracker and its reminders. A manual record: nothing here talks to a state system. Recording or
 * updating a filing does NOT touch the case (the prototype's saveFiling only writes the filing row); the confirmation
 * number a case needs to move past State Approval is entered on the stage move.
 * Access is `filingTracker` (Admin, Manager, Compliance) everywhere, scoped to the cases the caller can see.
 */
@Injectable()
export class FilingsService {
  constructor(
    private readonly repo: FilingsRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly counters: CounterService,
  ) {}

  // ---- filings: reads -----------------------------------------------------------------------------------------

  async list(c: ActorContext, query: ListFilingsQueryDto, caseId?: string): Promise<PaginatedResponse<FilingDto>> {
    if (query.nextActionFrom && query.nextActionTo && query.nextActionFrom > query.nextActionTo) {
      throw new ValidationFailedException([{ field: "nextActionTo", message: "nextActionTo can't be before nextActionFrom." }]);
    }
    const sort = parseSort(query, FILING_SORT_FIELDS, { field: "number", order: "desc" });
    const today = todayUtc();
    const search = query.search?.trim();
    const filingNumber = search ? /^fil-?(\d{1,9})$/i.exec(search)?.[1] : undefined;
    const caseNumber = search ? /^(?:prj-?)?(\d{1,9})$/i.exec(search)?.[1] : undefined;
    const targetCase = caseId ?? query.caseId;

    const where: Prisma.FilingWhereInput = {
      AND: [
        { case: { is: caseScope(c.actor) } },
        ...(targetCase ? [{ caseId: targetCase }] : []),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.nextActionFrom || query.nextActionTo
          ? [{ nextActionDate: { ...(query.nextActionFrom ? { gte: dateOnly(query.nextActionFrom) } : {}), ...(query.nextActionTo ? { lte: dateOnly(query.nextActionTo) } : {}) } }]
          : []),
        ...(search
          ? [
              {
                OR: [
                  ...(filingNumber ? [{ number: Number(filingNumber) }] : []),
                  ...(caseNumber ? [{ case: { is: { number: Number(caseNumber) } } }] : []),
                  { type: { contains: search, mode: "insensitive" as const } },
                  { reference: { contains: search, mode: "insensitive" as const } },
                  { case: { is: { client: { is: { name: { contains: search, mode: "insensitive" as const } } } } } },
                ],
              },
            ]
          : []),
      ],
    };
    const nullable = sort.field === "submittedOn" || sort.field === "nextActionDate";
    const orderBy: Prisma.FilingOrderByWithRelationInput[] = [nullable ? { [sort.field]: { sort: sort.order, nulls: "last" } } : { [sort.field]: sort.order }, { id: "asc" }];
    return paginate(query, ({ skip, take }) => this.repo.page(where, orderBy, skip, take), (f) => toFilingDto(f, today));
  }

  /** The filings of one case. The case must be in the caller's scope, otherwise 404 (even when the list would be empty). */
  async listForCase(c: ActorContext, caseId: string, query: ListFilingsQueryDto): Promise<PaginatedResponse<FilingDto>> {
    await this.requireCase(c, caseId);
    return this.list(c, query, caseId);
  }

  // ---- filings: writes ----------------------------------------------------------------------------------------

  async create(c: ActorContext, dto: CreateFilingDto): Promise<FilingDto> {
    await this.access.assert(c.actor, "filingTracker", undefined, c.requestId);
    const theCase = await this.requireCase(c, dto.caseId);
    const display = formatCaseDisplay(theCase.number);
    if (theCase.deletedAt) throw new CaseDeletedException(display);
    // A completed case can still be looked at, but no new work is opened on it.
    if (theCase.stage === "COMPLETED") throw new CaseCompletedException(display, "filing");

    const status = dto.status ?? "NOT_SUBMITTED";
    const state: FilingState = { status, submittedOn: dto.submittedOn ?? null, reference: dto.reference ?? "" };
    this.assertValid(state, todayUtc());

    const created = await this.repo.transaction(async (tx) => {
      const number = await this.counters.next("filing", tx);
      const row = await this.repo.create(
        {
          number,
          caseId: theCase.id,
          type: dto.type,
          status,
          submittedOn: state.submittedOn ? dateOnly(state.submittedOn) : null,
          reference: state.reference,
          nextAction: dto.nextAction ?? "",
          nextActionDate: dto.nextActionDate ? dateOnly(dto.nextActionDate) : null,
          outcome: outcomeFor(status, ""),
        },
        tx,
      );
      await this.record(c, `Added filing ${displayFiling(number)} · ${dto.type} · ${FILING_LABEL[status]}`, theCase, tx);
      return row;
    });
    return toFilingDto(await this.requireById(created.id));
  }

  async update(c: ActorContext, id: string, dto: UpdateFilingDto): Promise<FilingDto> {
    await this.access.assert(c.actor, "filingTracker", undefined, c.requestId);
    const filing = await this.require(c, id);
    const sent = (["type", "status", "submittedOn", "reference", "nextAction", "nextActionDate", "outcome"] as const).filter((f) => dto[f] !== undefined);
    if (sent.length === 0) throw new ValidationFailedException([{ field: "body", message: "Send at least one field to change." }]);

    const status = dto.status ?? filing.status;
    const state: FilingState = {
      status,
      submittedOn: dto.submittedOn === undefined ? isoDay(filing.submittedOn) : dto.submittedOn,
      reference: dto.reference ?? filing.reference,
    };
    this.assertValid(state, todayUtc());

    const move = classifyFilingMove(filing.status, status);
    const from = FILING_LABEL[filing.status];
    const to = FILING_LABEL[status];
    const reason = dto.reason?.trim() ?? "";
    if (move === "backward") {
      // Forward only, unless someone who runs the portal takes responsibility for stepping back, with a reason.
      if (c.actor.role !== "ADMIN" && c.actor.role !== "MANAGER") {
        throw new InvalidStateTransitionException("filing", from, to, "A filing only moves forward. Ask an Admin or Manager to move it back, with a reason.");
      }
      if (!reason) throw new FilingReasonRequiredException(from, to);
    }

    const data: Prisma.FilingUncheckedUpdateManyInput = {};
    const changes: string[] = [];
    const set = <K extends keyof typeof data>(key: K, value: (typeof data)[K], label: string): void => {
      data[key] = value;
      changes.push(label);
    };
    if (dto.type !== undefined && dto.type !== filing.type) set("type", dto.type, "type");
    if (status !== filing.status) set("status", status, `status ${from} → ${to}`);
    if (state.submittedOn !== isoDay(filing.submittedOn)) set("submittedOn", state.submittedOn ? dateOnly(state.submittedOn) : null, "submission date");
    if (state.reference !== filing.reference) set("reference", state.reference, "reference");
    if (dto.nextAction !== undefined && dto.nextAction !== filing.nextAction) set("nextAction", dto.nextAction, "next action");
    if (dto.nextActionDate !== undefined && dto.nextActionDate !== isoDay(filing.nextActionDate)) {
      set("nextActionDate", dto.nextActionDate ? dateOnly(dto.nextActionDate) : null, "next action date");
    }
    const outcome = outcomeFor(status, dto.outcome ?? filing.outcome);
    if (outcome !== filing.outcome) set("outcome", outcome, "outcome");
    if (changes.length === 0) return toFilingDto(filing);

    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.updateIfStatus(filing.id, filing.status, data, tx))) throw new ConcurrentModificationException("filing");
      const why = move === "backward" ? ` · reason: ${reason}` : "";
      await this.record(c, `Updated filing ${displayFiling(filing.number)} · ${dto.type ?? filing.type} · ${to} (${changes.join(", ")})${why}`, filing.case, tx);
    });
    return toFilingDto(await this.requireById(filing.id));
  }

  // ---- reminders ----------------------------------------------------------------------------------------------

  async listReminders(c: ActorContext, caseId: string, query: ListRemindersQueryDto): Promise<PaginatedResponse<ReminderDto>> {
    await this.requireCase(c, caseId);
    parseSort(query, ["date"], { field: "date", order: "asc" });
    const { skip, take } = windowOf(query);
    const [rows, total] = await this.repo.reminderPage(caseId, skip, take);
    return new PaginatedResponse(rows.map(toReminderDto), total, query.page, query.limit);
  }

  async addReminder(c: ActorContext, caseId: string, dto: CreateReminderDto): Promise<ReminderDto> {
    await this.access.assert(c.actor, "filingTracker", undefined, c.requestId);
    const theCase = await this.requireCase(c, caseId);
    const reminder = await this.repo.transaction(async (tx) => {
      const row = await this.repo.createReminder({ caseId: theCase.id, title: dto.title, date: dateOnly(dto.date), kind: dto.kind }, tx);
      await this.record(c, `Added illustrative reminder “${dto.title}” (${dto.date}) on ${formatCaseDisplay(theCase.number)}`, theCase, tx);
      return row;
    });
    return toReminderDto(reminder);
  }

  async removeReminder(c: ActorContext, caseId: string, id: string): Promise<ReminderDto> {
    await this.access.assert(c.actor, "filingTracker", undefined, c.requestId);
    const theCase = await this.requireCase(c, caseId);
    const reminder = await this.repo.findReminder(theCase.id, id);
    if (!reminder) throw new ResourceNotFoundException("reminder", id);
    await this.repo.transaction(async (tx) => {
      await this.repo.removeReminder(reminder.id, tx);
      await this.record(c, `Removed reminder “${reminder.title}” from ${formatCaseDisplay(theCase.number)}`, theCase, tx);
    });
    return toReminderDto(reminder);
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /** The prototype's filing rules, in its order: submission date, then the state's reference, plus "not in the future". */
  private assertValid(state: FilingState, today: Date): void {
    if (NEEDS_SUBMISSION_DATE.includes(state.status) && !state.submittedOn) throw new FilingSubmissionDateRequiredException(FILING_LABEL[state.status]);
    if (state.submittedOn && dateOnly(state.submittedOn).getTime() > today.getTime()) throw new FilingDateInFutureException();
    if (state.status === "APPROVED" && !state.reference.trim()) throw new FilingNumberRequiredException("approved");
  }

  private async requireCase(c: ActorContext, id: string): Promise<CaseForFiling> {
    const theCase = await this.repo.findCase({ AND: [{ id }, caseScope(c.actor, { includeRemoved: true })] });
    if (!theCase) throw new ResourceNotFoundException("case", id);
    return theCase;
  }

  private async require(c: ActorContext, id: string): Promise<FilingRecord> {
    const filing = await this.repo.findOne({ AND: [{ id }, { case: { is: caseScope(c.actor) } }] });
    if (!filing) throw new ResourceNotFoundException("filing", id);
    return filing;
  }

  private async requireById(id: string, db?: Db): Promise<FilingRecord> {
    const filing = await this.repo.findById(id, db);
    if (!filing) throw new ResourceNotFoundException("filing", id);
    return filing;
  }

  private record(c: ActorContext, action: string, theCase: { client: { clientProfile: { caseNumber: string } | null } }, tx: Db): Promise<void> {
    return this.audit.record(
      { actorId: c.actor.id, actorRole: c.actor.role, action, target: theCase.client.clientProfile?.caseNumber ?? "", category: "cases", requestId: c.requestId, ipAddress: c.ipAddress },
      tx,
    );
  }
}
