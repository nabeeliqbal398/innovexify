import { Injectable } from "@nestjs/common";
import type { Prisma, TicketStatus } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import { CounterService, formatCaseDisplay } from "../../../common/counter/counter.service";
import {
  CaseClientMismatchException,
  ConcurrentModificationException,
  InvalidStateTransitionException,
  InvalidTicketHandlerException,
  PermissionDeniedException,
  ResourceNotFoundException,
  TicketClosedException,
  TicketEscalationNotAllowedException,
  TicketReopenWindowPassedException,
  TicketResolutionRequiredException,
  TicketStatusStaffOnlyException,
  UserRemovedException,
  ValidationFailedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { NotificationService, type EmailRecipient } from "../../../common/notifications/notification.service";
import { parseSort, windowOf } from "../../../common/pagination/paginate";
import { AccessService } from "../../../common/permissions/access.service";
import { PaginatedResponse } from "../../../common/responses/api-response";
import { clientScope, ticketScope } from "../../../common/scope/scope";
import { AppConfig } from "../../../config/app-config";
import type {
  AssignTicketDto,
  ChangeTicketStatusDto,
  CreateTicketDto,
  EscalateTicketDto,
  ListTicketsQueryDto,
  ReplyTicketDto,
  ResolveTicketDto,
  TicketActionDto,
  TicketDetailDto,
  TicketDto,
  TicketMessageDto,
} from "../dto/tickets.dto";
import { NEXT_STATUS, TICKET_LABEL, whyNot, withinReopenWindow } from "../interfaces/ticket-rules";
import { TicketsRepository, type StatusChange, type TicketMessageRecord, type TicketRecord } from "../repository/tickets.repository";

type Db = Prisma.TransactionClient;

const SORT_FIELDS = ["number", "createdAt", "updatedAt", "priority", "status"] as const;
const displayTicket = (number: number): string => `TKT-${number}`;

export function toTicketDto(t: TicketRecord, forClient: boolean): TicketDto {
  return {
    id: t.id,
    number: t.number,
    displayNumber: displayTicket(t.number),
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    statusLabel: TICKET_LABEL[t.status],
    version: t.version,
    client: { id: t.client.id, name: t.client.name, caseNumber: t.client.clientProfile?.caseNumber ?? "" },
    handler: t.handler,
    case: t.case ? { id: t.case.id, displayNumber: formatCaseDisplay(t.case.number) } : null,
    ...(forClient ? {} : { escalated: t.escalated }),
    resolution: t.resolutionNote || t.resolvedAt ? { note: t.resolutionNote, by: t.resolvedBy, at: t.resolvedAt } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

const toMessageDto = (m: TicketMessageRecord): TicketMessageDto => ({ id: m.id, text: m.text, internal: m.internal, author: m.author, at: m.createdAt });

/**
 * Tickets: a client raises one, the team works it through the status machine in `ticket-rules.ts`. A client sees their own
 * tickets, never internal notes, and a history without the events where the status didn't change. A CSR works their own
 * clients' tickets; Admin, Manager and Compliance every ticket. Status changes are optimistically locked with `version`.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly repo: TicketsRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly counters: CounterService,
    private readonly notifications: NotificationService,
    private readonly config: AppConfig,
  ) {}

  // ---- reads --------------------------------------------------------------------------------------------------

  async list(c: ActorContext, query: ListTicketsQueryDto): Promise<PaginatedResponse<TicketDto>> {
    const sort = parseSort(query, SORT_FIELDS, { field: "number", order: "desc" });
    const forClient = c.actor.role === "CLIENT";
    const search = query.search?.trim();
    const number = search ? /^(?:tkt-?)?(\d{1,9})$/i.exec(search)?.[1] : undefined;
    const where: Prisma.TicketWhereInput = {
      AND: [
        ticketScope(c.actor),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.priority ? [{ priority: query.priority }] : []),
        ...(query.category ? [{ category: query.category }] : []),
        ...(query.clientId ? [{ clientId: query.clientId }] : []),
        // Handler and escalation are the team's business: a client can't filter on them.
        ...(!forClient && query.handlerId ? [{ handlerId: query.handlerId === "none" ? null : query.handlerId }] : []),
        ...(!forClient && query.escalated !== undefined ? [{ escalated: query.escalated }] : []),
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
    const orderBy: Prisma.TicketOrderByWithRelationInput[] = [{ [sort.field]: sort.order }, { id: "asc" }];
    const { skip, take } = windowOf(query);
    const [rows, total] = await this.repo.page(where, orderBy, skip, take);
    return new PaginatedResponse(rows.map((t) => toTicketDto(t, forClient)), total, query.page, query.limit);
  }

  async get(c: ActorContext, id: string): Promise<TicketDetailDto> {
    return this.detail(c, await this.require(c, id));
  }

  // ---- create -------------------------------------------------------------------------------------------------

  /** A client raises a ticket for themselves; staff may open one on a client's behalf (a CSR only for their own clients). */
  async create(c: ActorContext, dto: CreateTicketDto): Promise<TicketDetailDto> {
    const isClient = c.actor.role === "CLIENT";
    let clientId: string;
    if (isClient) {
      if (dto.clientId !== undefined && dto.clientId !== c.actor.id) throw new ResourceNotFoundException("client", dto.clientId);
      clientId = c.actor.id;
      if (dto.priority !== undefined && dto.priority !== "NORMAL" && dto.priority !== "HIGH") {
        throw new ValidationFailedException([{ field: "priority", message: "Choose Normal or High." }]);
      }
    } else {
      if (!dto.clientId) throw new ValidationFailedException([{ field: "clientId", message: "Choose the client this ticket is for." }]);
      clientId = dto.clientId;
    }
    const client = await this.repo.findClient({ AND: [{ id: clientId, role: "CLIENT" }, clientScope(c.actor, { includeRemoved: true })] });
    if (!client) throw new ResourceNotFoundException("client", clientId);
    if (isClient) await this.access.assert(c.actor, "ticketOwn", { client: client.id }, c.requestId, client.clientProfile?.caseNumber ?? "");
    else await this.access.assert(c.actor, "ticketsStaff", { client: client.id, csrOf: client.clientProfile?.csrId ?? null }, c.requestId, client.clientProfile?.caseNumber ?? "");
    if (client.status === "REMOVED") throw new UserRemovedException(client.name);

    let caseId: string | null = null;
    if (dto.caseId) {
      const theCase = await this.repo.findCase(dto.caseId);
      if (!theCase) throw new ResourceNotFoundException("case", dto.caseId);
      if (theCase.clientId !== client.id) throw new CaseClientMismatchException(formatCaseDisplay(theCase.number), client.name);
      caseId = theCase.id;
    }

    let emails: EmailRecipient[] = [];
    let text = "";
    const id = await this.repo.transaction(async (tx) => {
      const number = await this.counters.next("ticket", tx);
      const created = await this.repo.create(
        { number, clientId: client.id, caseId, title: dto.title, description: dto.description, category: dto.category, priority: dto.priority ?? "NORMAL", status: "OPEN" },
        tx,
      );
      await this.repo.addEvent({ ticketId: created.id, fromStatus: null, toStatus: "OPEN", byId: c.actor.id, note: "Ticket created" }, tx);
      const name = await this.actorName(c, tx);
      if (isClient) {
        text = `New ticket ${displayTicket(number)} from ${name}`;
        emails = await this.notifications.notify(tx, { userIds: await this.notifications.teamOf(client.id, tx), text, link: "tickets", category: "TICKETS", excludeUserId: c.actor.id });
      } else {
        text = `${name} opened ticket ${displayTicket(number)} for you: ${dto.title}`;
        emails = await this.notifications.notify(tx, { userIds: [client.id], text, link: "home", category: "TICKETS", excludeUserId: c.actor.id });
      }
      await this.record(c, `Created ticket “${dto.title}” (${displayTicket(number)})`, client.clientProfile?.caseNumber ?? "", tx);
      return created.id;
    });
    await this.notifications.emailAfterCommit(emails, text, "ticket");
    return this.detail(c, await this.requireById(id));
  }

  // ---- thread -------------------------------------------------------------------------------------------------

  /** A reply. Staff may mark it internal (the client never sees it). A closed ticket takes no replies. */
  async reply(c: ActorContext, id: string, dto: ReplyTicketDto): Promise<TicketMessageDto> {
    const ticket = await this.require(c, id);
    await this.assertMayAct(c, ticket);
    const display = displayTicket(ticket.number);
    if (ticket.status === "CLOSED") throw new TicketClosedException(display, "reply");
    const internal = dto.internal === true;
    if (internal && c.actor.role === "CLIENT") throw new PermissionDeniedException("Only staff can write internal notes. Your reply is visible to the team.");

    let emails: EmailRecipient[] = [];
    let text = "";
    const message = await this.repo.transaction(async (tx) => {
      const created = await this.repo.addMessage({ ticketId: ticket.id, authorId: c.actor.id, text: dto.text, internal }, tx);
      await this.repo.touch(ticket.id, tx);
      const name = created.author.name;
      if (!internal) {
        if (c.actor.role === "CLIENT") {
          text = `${name} updated ${display}`;
          emails = await this.notifications.notify(tx, { userIds: await this.notifications.teamOf(ticket.clientId, tx), text, link: "tickets", category: "TICKETS", excludeUserId: c.actor.id });
        } else {
          text = `Reply on ${display} from ${name}`;
          emails = await this.notifications.notify(tx, { userIds: [ticket.clientId], text, link: "home", category: "TICKETS", excludeUserId: c.actor.id });
        }
      }
      await this.record(c, `${internal ? "Internal note on " : "Replied on "}${display}`, ticket.client.clientProfile?.caseNumber ?? "", tx);
      return created;
    });
    await this.notifications.emailAfterCommit(emails, text, "ticket");
    return toMessageDto(message);
  }

  // ---- status -------------------------------------------------------------------------------------------------

  async changeStatus(c: ActorContext, id: string, dto: ChangeTicketStatusDto): Promise<TicketDetailDto> {
    const ticket = await this.require(c, id);
    await this.assertMayAct(c, ticket);
    return this.moveTo(c, ticket, dto.status, dto.note?.trim() ?? "", dto.version);
  }

  /** Resolve with resolution notes, which the client sees. */
  async resolve(c: ActorContext, id: string, dto: ResolveTicketDto): Promise<TicketDetailDto> {
    const ticket = await this.require(c, id);
    await this.assertMayAct(c, ticket);
    return this.moveTo(c, ticket, "RESOLVED", dto.resolutionNote?.trim() ?? "", dto.version);
  }

  /** A client confirms the issue is resolved, or staff close the ticket. */
  async close(c: ActorContext, id: string, dto: TicketActionDto): Promise<TicketDetailDto> {
    const ticket = await this.require(c, id);
    await this.assertMayAct(c, ticket);
    return this.moveTo(c, ticket, "CLOSED", dto.note?.trim() ?? "", dto.version);
  }

  /** Staff take a ticket (or, Admin and Manager, hand it to someone). Doesn't change the status, so a client never sees it. */
  async assign(c: ActorContext, id: string, dto: AssignTicketDto): Promise<TicketDetailDto> {
    const ticket = await this.require(c, id);
    await this.assertStaff(c, ticket);
    const display = displayTicket(ticket.number);
    if (ticket.status === "CLOSED") throw new TicketClosedException(display, "change");
    this.assertVersion(ticket, dto.version);

    const targetId = dto.handlerId ?? c.actor.id;
    if (targetId !== c.actor.id && c.actor.role !== "ADMIN" && c.actor.role !== "MANAGER") {
      throw new PermissionDeniedException("Only Admin and Manager can hand a ticket to someone else. You can take it yourself.");
    }
    const target = await this.repo.findStaff(targetId);
    if (!target || target.role === "CLIENT" || target.status !== "ACTIVE") throw new InvalidTicketHandlerException();
    if (ticket.handlerId === target.id) return this.detail(c, ticket);

    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.updateIfVersion(ticket.id, ticket.version, { handlerId: target.id }, tx))) throw new ConcurrentModificationException("ticket");
      await this.repo.addEvent({ ticketId: ticket.id, fromStatus: ticket.status, toStatus: ticket.status, byId: c.actor.id, note: target.id === c.actor.id ? "Took over the ticket" : `Assigned to ${target.name}` }, tx);
      if (target.id !== c.actor.id) await this.notifications.notify(tx, { userIds: [target.id], text: `${display} was assigned to you`, link: "tickets", category: "TICKETS", excludeUserId: c.actor.id });
      await this.record(c, target.id === c.actor.id ? `Took over ${display}` : `Assigned ${display} to ${target.name}`, ticket.client.clientProfile?.caseNumber ?? "", tx);
    });
    return this.detail(c, await this.requireById(ticket.id));
  }

  /** Escalate to Admin and Manager (or take the escalation off). A resolved or closed ticket can't be escalated. */
  async escalate(c: ActorContext, id: string, dto: EscalateTicketDto): Promise<TicketDetailDto> {
    const ticket = await this.require(c, id);
    await this.assertStaff(c, ticket);
    const display = displayTicket(ticket.number);
    const escalate = dto.escalated !== false;
    if (escalate && (ticket.status === "RESOLVED" || ticket.status === "CLOSED")) throw new TicketEscalationNotAllowedException(display, ticket.status);
    this.assertVersion(ticket, dto.version);
    if (ticket.escalated === escalate) return this.detail(c, ticket);

    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.updateIfVersion(ticket.id, ticket.version, { escalated: escalate }, tx))) throw new ConcurrentModificationException("ticket");
      await this.repo.addEvent(
        { ticketId: ticket.id, fromStatus: ticket.status, toStatus: ticket.status, byId: c.actor.id, note: escalate ? (dto.note?.trim() || "Escalated to Admin and Manager") : "Escalation removed" },
        tx,
      );
      if (escalate) {
        const name = await this.actorName(c, tx);
        await this.notifications.notify(tx, { userIds: await this.repo.staffIds(["ADMIN", "MANAGER"], tx), text: `${display} was escalated by ${name}`, link: "tickets", excludeUserId: c.actor.id });
      }
      await this.record(c, `${escalate ? "Escalated " : "Removed escalation on "}${display}`, ticket.client.clientProfile?.caseNumber ?? "", tx);
    });
    return this.detail(c, await this.requireById(ticket.id));
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /** The one place a status changes: rules, the version-guarded write, the event, the notifications and the audit entry. */
  private async moveTo(c: ActorContext, ticket: TicketRecord, to: TicketStatus, note: string, version: number | undefined): Promise<TicketDetailDto> {
    const display = displayTicket(ticket.number);
    const from = ticket.status;
    const isClient = c.actor.role === "CLIENT";
    this.assertVersion(ticket, version);

    // A client can reopen or confirm a resolved ticket; every other status is the team's to set.
    if (isClient && to !== "OPEN" && to !== "CLOSED") throw new TicketStatusStaffOnlyException(TICKET_LABEL[to]);
    if (isClient && from !== "RESOLVED") {
      throw new InvalidStateTransitionException("ticket", TICKET_LABEL[from], TICKET_LABEL[to], "You can reopen or confirm a ticket once it has been resolved. Reply to it to reach the team.");
    }
    if (!NEXT_STATUS[from].includes(to)) throw new InvalidStateTransitionException("ticket", TICKET_LABEL[from], TICKET_LABEL[to], whyNot(from, to));
    if (isClient && to === "OPEN" && !withinReopenWindow(ticket.resolvedAt, new Date(), this.config.env.TICKET_REOPEN_DAYS)) {
      throw new TicketReopenWindowPassedException(display, this.config.env.TICKET_REOPEN_DAYS);
    }
    if (to === "RESOLVED" && !note) throw new TicketResolutionRequiredException();

    const change: StatusChange = { status: to };
    if (!isClient) change.handlerId = ticket.handlerId ?? c.actor.id;
    if (to === "RESOLVED") Object.assign(change, { resolutionNote: note, resolvedById: c.actor.id, resolvedAt: new Date() });
    const eventNote = isClient ? (to === "OPEN" ? "Client requested reopening" : "Client confirmed the issue is resolved") : note;
    const verb = isClient ? (to === "OPEN" ? "Requested reopening of " : "Confirmed resolution of ") : to === "RESOLVED" ? "Resolved " : `Changed status of `;

    let emails: EmailRecipient[] = [];
    let emailText = "";
    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.updateIfVersion(ticket.id, ticket.version, change, tx))) throw new ConcurrentModificationException("ticket");
      await this.repo.addEvent({ ticketId: ticket.id, fromStatus: from, toStatus: to, byId: c.actor.id, note: eventNote }, tx);
      if (isClient) {
        emailText = `${await this.actorName(c, tx)} updated ${display}`;
        emails = await this.notifications.notify(tx, { userIds: await this.notifications.teamOf(ticket.clientId, tx), text: emailText, link: "tickets", category: "TICKETS", excludeUserId: c.actor.id });
      } else {
        emailText = `${display} is now ${TICKET_LABEL[to]}`;
        emails = await this.notifications.notify(tx, { userIds: [ticket.clientId], text: emailText, link: "home", category: "TICKETS", excludeUserId: c.actor.id });
        await this.notifications.notify(tx, { userIds: [ticket.handlerId], text: emailText, link: "tickets", category: "TICKETS", excludeUserId: c.actor.id });
      }
      await this.record(c, `${verb}${display}${verb === "Changed status of " ? ` to ${TICKET_LABEL[to]}` : ""}`, ticket.client.clientProfile?.caseNumber ?? "", tx);
    });
    await this.notifications.emailAfterCommit(emails, emailText, "ticket");
    return this.detail(c, await this.requireById(ticket.id));
  }

  /** What the role may see: a client gets no internal notes and no events where the status didn't change. */
  private async detail(c: ActorContext, ticket: TicketRecord): Promise<TicketDetailDto> {
    const forClient = c.actor.role === "CLIENT";
    const [messages, events] = await Promise.all([this.repo.messages(ticket.id, !forClient), this.repo.events(ticket.id, forClient)]);
    return {
      ...toTicketDto(ticket, forClient),
      messages: messages.map(toMessageDto),
      events: events.map((e) => ({ id: e.id, from: e.fromStatus, to: e.toStatus, note: e.note, by: e.by, at: e.at })),
    };
  }

  /** A ticket the caller may see. Anything else is a 404, the same as one that doesn't exist. */
  private async require(c: ActorContext, id: string): Promise<TicketRecord> {
    const ticket = await this.repo.findOne({ AND: [{ id }, ticketScope(c.actor)] });
    if (!ticket) throw new ResourceNotFoundException("ticket", id);
    return ticket;
  }

  private async requireById(id: string, db?: Db): Promise<TicketRecord> {
    const ticket = await this.repo.findById(id, db);
    if (!ticket) throw new ResourceNotFoundException("ticket", id);
    return ticket;
  }

  /** A client acts on their own tickets (`ticketOwn`), staff on those in their scope (`ticketsStaff`). */
  private async assertMayAct(c: ActorContext, ticket: TicketRecord): Promise<void> {
    const caseNumber = ticket.client.clientProfile?.caseNumber ?? "";
    if (c.actor.role === "CLIENT") await this.access.assert(c.actor, "ticketOwn", { client: ticket.clientId }, c.requestId, caseNumber);
    else await this.access.assert(c.actor, "ticketsStaff", { client: ticket.clientId, csrOf: ticket.client.clientProfile?.csrId ?? null }, c.requestId, caseNumber);
  }

  private async assertStaff(c: ActorContext, ticket: TicketRecord): Promise<void> {
    if (c.actor.role === "CLIENT") await this.access.assert(c.actor, "ticketsStaff", { client: ticket.clientId }, c.requestId, ticket.client.clientProfile?.caseNumber ?? "");
    else await this.assertMayAct(c, ticket);
  }

  private assertVersion(ticket: TicketRecord, version: number | undefined): void {
    if (version !== undefined && version !== ticket.version) throw new ConcurrentModificationException("ticket");
  }

  private async actorName(c: ActorContext, tx: Db): Promise<string> {
    return (await tx.user.findUnique({ where: { id: c.actor.id }, select: { name: true } }))?.name ?? "Someone";
  }

  private record(c: ActorContext, action: string, target: string, tx: Db): Promise<void> {
    return this.audit.record({ actorId: c.actor.id, actorRole: c.actor.role, action, target, category: "tickets", requestId: c.requestId, ipAddress: c.ipAddress }, tx);
  }
}
