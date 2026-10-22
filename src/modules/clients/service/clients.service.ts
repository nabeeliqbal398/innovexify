import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import { CounterService, formatCaseDisplay, formatClientCaseNumber } from "../../../common/counter/counter.service";
import {
  CsrRequiredException,
  CsrUnchangedException,
  EmailInUseException,
  InvalidCsrAssignmentException,
  PermissionDeniedException,
  ResourceNotFoundException,
  ServiceInactiveException,
  UserRemovedException,
  ValidationFailedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { NotificationService } from "../../../common/notifications/notification.service";
import { paginate, parseSort } from "../../../common/pagination/paginate";
import { AccessService } from "../../../common/permissions/access.service";
import type { PaginatedResponse } from "../../../common/responses/api-response";
import { clientScope } from "../../../common/scope/scope";
import { dateOnly, formatDateOnly } from "../../../common/validators/iso-date";
import { InvitationService } from "../../auth/service/invitation.service";
import type { CaseBriefDto, ChangeCsrDto, ClientDetailDto, CreatedClientDto, ClientDto, CreateClientDto, ListClientsQueryDto, UpdateClientProfileDto } from "../dto/clients.dto";
import { CLIENT_SORT_FIELDS, type ClientRecord } from "../interfaces/clients.interfaces";
import { ClientsRepository } from "../repository/clients.repository";

const DEFAULT_SERVICE = "llc";
/** Fields a client may change about themselves. Business name and formation state are set by the team. */
const CLIENT_EDITABLE = ["phone", "address", "contactPreference", "preferredName"] as const;
const PROFILE_FIELDS = ["businessName", "formationState", "phone", "address", "contactPreference", "preferredName"] as const;

type CaseBrief = ClientRecord["clientCases"][number];

export const toCaseBrief = (c: CaseBrief): CaseBriefDto => ({
  id: c.id,
  number: c.number,
  displayNumber: formatCaseDisplay(c.number),
  serviceId: c.serviceId,
  stage: c.stage,
  status: c.status,
  priority: c.priority,
  deadline: formatDateOnly(c.deadline),
  lastActivityAt: c.lastActivityAt,
});

function toClientDto(client: ClientRecord): ClientDto {
  const profile = client.clientProfile;
  const latest = client.clientCases[0];
  return {
    id: client.id,
    email: client.email,
    name: client.name,
    status: client.status,
    caseNumber: profile?.caseNumber ?? "",
    businessName: profile?.businessName ?? "",
    formationState: profile?.formationState ?? "",
    phone: profile?.phone ?? "",
    contactPreference: profile?.contactPreference ?? "PORTAL_MESSAGE",
    csr: profile?.csr ?? null,
    joinedAt: profile?.joinedAt ?? null,
    createdAt: client.createdAt,
    case: latest ? toCaseBrief(latest) : null,
  };
}

function toClientDetail(client: ClientRecord): ClientDetailDto {
  const cases = client.clientCases.map(toCaseBrief);
  return {
    ...toClientDto(client),
    address: client.clientProfile?.address ?? "",
    preferredName: client.clientProfile?.preferredName ?? "",
    cases,
    caseSummary: {
      total: cases.length,
      open: cases.filter((c) => c.stage !== "COMPLETED").length,
      completed: cases.filter((c) => c.stage === "COMPLETED").length,
    },
  };
}

interface CreatedRecord {
  clientId: string;
  caseNumber: string;
  link: { url: string; expiresAt: Date };
  invitedBy: string;
}

const isUniqueViolation = (error: unknown): boolean => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    private readonly repo: ClientsRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly counters: CounterService,
    private readonly invitations: InvitationService,
    private readonly notifications: NotificationService,
  ) {}

  // ---- reads --------------------------------------------------------------------------------------------------

  async list(c: ActorContext, query: ListClientsQueryDto): Promise<PaginatedResponse<ClientDto>> {
    const sort = parseSort(query, CLIENT_SORT_FIELDS, { field: "createdAt", order: "desc" });
    const search = query.search?.trim();
    const profileFilter: Prisma.ClientProfileWhereInput = {
      ...(query.csrId === "none" ? { csrId: null } : query.csrId ? { csrId: query.csrId } : {}),
      ...(query.state ? { formationState: { equals: query.state, mode: "insensitive" } } : {}),
    };
    const where: Prisma.UserWhereInput = {
      AND: [
        { role: "CLIENT" },
        clientScope(c.actor, { includeRemoved: query.status === "REMOVED" }),
        ...(query.status ? [{ status: query.status }] : []),
        ...(Object.keys(profileFilter).length ? [{ clientProfile: { is: profileFilter } }] : []),
        ...(search
          ? [
              {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { email: { contains: search, mode: "insensitive" as const } },
                  { clientProfile: { is: { businessName: { contains: search, mode: "insensitive" as const } } } },
                  { clientProfile: { is: { caseNumber: { contains: search, mode: "insensitive" as const } } } },
                ],
              },
            ]
          : []),
      ],
    };
    const profileSort = ["caseNumber", "businessName", "formationState", "joinedAt"] as const;
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [
      (profileSort as readonly string[]).includes(sort.field) ? { clientProfile: { [sort.field]: sort.order } } : { [sort.field]: sort.order },
      { id: "asc" },
    ];
    return paginate(query, ({ skip, take }) => this.repo.page(where, orderBy, skip, take), toClientDto);
  }

  async get(c: ActorContext, id: string): Promise<ClientDetailDto> {
    return toClientDetail(await this.requireInScope(c, id));
  }

  // ---- create -------------------------------------------------------------------------------------------------

  /**
   * One transaction: the client's user (INVITED), their profile with the next case ID, the first case at "Invitation
   * Sent", the optional CSR assignment and its notification, the audit entries and the invitation link (token). If any
   * of that throws, nothing is kept and the counters are handed back.
   *
   * The invitation EMAIL is sent after the commit. A mail outage must not undo a client that was created correctly:
   * the failure is logged and audited, the client is kept, and the response says `invitationEmailSent: false` so the
   * user can use "Resend invitation".
   */
  async create(c: ActorContext, dto: CreateClientDto): Promise<CreatedClientDto> {
    if (await this.repo.findHoldingEmail(dto.email)) throw new EmailInUseException(dto.email);

    const csrId = await this.resolveNewClientCsr(c, dto.csrId);
    const serviceId = dto.serviceId || DEFAULT_SERVICE;
    const service = await this.repo.findService(serviceId);
    if (!service) throw new ValidationFailedException([{ field: "serviceId", message: `We couldn't find the service "${serviceId}". Choose one from the service catalog.` }]);
    if (!service.active) throw new ServiceInactiveException(service.name);

    const name = dto.name?.trim() || dto.email.split("@")[0] || dto.email;
    let created: CreatedRecord;
    try {
      created = await this.repo.transaction(async (tx) => {
        const prefix = await this.notifications.casePrefix(tx);
        // Always the same order (client, then case), so two parallel creations can queue on the counters but never deadlock.
        const clientNumber = await this.counters.next("client", tx);
        const caseNumber = formatClientCaseNumber(prefix, new Date().getFullYear(), clientNumber);
        const projectNumber = await this.counters.next("case", tx);

        const client = await this.repo.createClient(
          { email: dto.email, name, invitedById: c.actor.id, caseNumber, csrId, businessName: dto.businessName ?? "", formationState: dto.formationState ?? "" },
          tx,
        );
        await this.repo.createInitialCase(
          { number: projectNumber, clientId: client.id, serviceId, priority: dto.priority ?? "NORMAL", deadline: dto.deadline ? dateOnly(dto.deadline) : null, byId: c.actor.id },
          tx,
        );

        await this.record(c, `Invited Client ${dto.email}`, caseNumber, "users", tx);
        await this.record(c, `Created case ${formatCaseDisplay(projectNumber)} (${service.name})`, caseNumber, "cases", tx);
        if (csrId) {
          const csr = await this.repo.findCsr(csrId, tx);
          await this.record(c, `Assigned CSR ${csr?.name ?? ""}`, caseNumber, "cases", tx);
          await this.notifications.notify(tx, { userIds: [csrId], text: `New client assigned to you: ${name}`, link: "clients" });
        }
        const link = await this.invitations.issue(client.id, tx);
        return { clientId: client.id, caseNumber, link, invitedBy: await this.actorName(c, tx) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailInUseException(dto.email);
      throw error;
    }

    const invitationEmail = await this.sendInvitationEmail(c, created, { email: dto.email, name, note: dto.note });
    // Read back without the scope filter: a CSR who assigned the new client to a colleague can't otherwise see it.
    const row = await this.repo.findOne({ id: created.clientId });
    if (!row) throw new ResourceNotFoundException("client", created.clientId);
    return { ...toClientDetail(row), invitationEmailSent: invitationEmail === "sent", invitationEmail };
  }

  /** After the commit. Never throws: a failure is logged and audited, and reported to the caller as `false`. */
  private async sendInvitationEmail(c: ActorContext, created: CreatedRecord, who: { email: string; name: string; note?: string }): Promise<"sent" | "switched-off" | "failed"> {
    try {
      const outcome = await this.invitations.sendInvitation(
        { userId: created.clientId, email: who.email, name: who.name, role: "CLIENT", invitedBy: created.invitedBy, note: who.note, caseNumber: created.caseNumber },
        created.link,
      );
      return outcome;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`The invitation email to ${who.email} could not be sent: ${reason}`);
      try {
        await this.audit.record({
          actorId: c.actor.id,
          actorRole: c.actor.role,
          action: `Invitation email to ${who.email} could not be sent (client kept; use Resend invitation)`,
          target: created.caseNumber,
          ok: false,
          category: "users",
          requestId: c.requestId,
          ipAddress: c.ipAddress,
        });
      } catch (auditError) {
        this.logger.error(`Could not audit the failed invitation email: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
      }
      return "failed";
    }
  }

  // ---- edits --------------------------------------------------------------------------------------------------

  async updateProfile(c: ActorContext, id: string, dto: UpdateClientProfileDto): Promise<ClientDetailDto> {
    const client = await this.requireInScope(c, id);
    if (client.status === "REMOVED") throw new UserRemovedException(client.name);

    const sent = PROFILE_FIELDS.filter((f) => dto[f] !== undefined);
    if (sent.length === 0) throw new ValidationFailedException([{ field: "body", message: "Send at least one field to change." }]);

    if (c.actor.role === "CLIENT") {
      // Scope already limits a client to their own record. They can edit contact details, not what the team set up.
      const locked = sent.filter((f) => !(CLIENT_EDITABLE as readonly string[]).includes(f));
      if (locked.length) {
        throw new PermissionDeniedException(`You can change your phone, address, preferred name and contact preference. ${locked.join(" and ")} can only be changed by Admin and Manager.`);
      }
    } else {
      await this.access.assert(c.actor, "editCase", undefined, c.requestId, client.clientProfile?.caseNumber ?? client.email);
    }

    const current = client.clientProfile;
    const changed = sent.filter((f) => dto[f] !== current?.[f]);
    if (changed.length === 0) return toClientDetail(client);

    const data: Prisma.ClientProfileUpdateInput = {};
    for (const field of changed) Object.assign(data, { [field]: dto[field] });

    await this.repo.transaction(async (tx) => {
      await this.repo.updateProfile(client.id, data, tx);
      const own = client.id === c.actor.id;
      await this.record(
        c,
        own ? `Updated own contact information (${changed.join(", ")})` : `Updated profile of ${client.name} (${changed.join(", ")})`,
        current?.caseNumber ?? client.email,
        "users",
        tx,
      );
    });
    return toClientDetail(await this.requireInScope(c, id));
  }

  /** Assigns a CSR to a client who has none (assignNewClient) or reassigns one who has (reassignClient). */
  async changeCsr(c: ActorContext, id: string, dto: ChangeCsrDto): Promise<ClientDetailDto> {
    const client = await this.requireInScope(c, id);
    if (client.status === "REMOVED") throw new UserRemovedException(client.name);
    const profile = client.clientProfile;
    const previousId = profile?.csrId ?? null;
    const caseNumber = profile?.caseNumber ?? client.email;

    await this.access.assert(c.actor, previousId ? "reassignClient" : "assignNewClient", { csr: previousId }, c.requestId, caseNumber);

    const nextId = dto.csrId === "me" ? c.actor.id : dto.csrId;
    const next = await this.requireAssignableCsr(nextId);
    if (previousId === next.id) throw new CsrUnchangedException(client.name, next.name);

    await this.repo.transaction(async (tx) => {
      await this.repo.updateProfile(client.id, { csr: { connect: { id: next.id } } }, tx);
      if (previousId) {
        const why = dto.reason ? ` · reason: ${dto.reason}` : "";
        await this.record(c, `Reassigned ${client.name} from ${profile?.csr?.name ?? "unassigned"} to ${next.name}${why}`, caseNumber, "cases", tx);
        await this.notifications.notify(tx, { userIds: [next.id, previousId], text: `${client.name} reassigned to ${next.name}`, link: "clients" });
      } else {
        await this.record(c, `Assigned ${client.name} to ${next.name}`, caseNumber, "cases", tx);
        await this.notifications.notify(tx, { userIds: [next.id], text: `New client assigned to you: ${client.name}`, link: "clients" });
      }
    });
    return toClientDetail(await this.requireInScope(c, id));
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /** A client the caller may see. Anything else, including a client that exists but belongs to another CSR, is a 404. */
  private async requireInScope(c: ActorContext, id: string): Promise<ClientRecord> {
    const client = await this.repo.findOne({ AND: [{ id, role: "CLIENT" }, clientScope(c.actor, { includeRemoved: true })] });
    if (!client) throw new ResourceNotFoundException("client", id);
    return client;
  }

  /** CSR for a brand-new client: required from a CSR, optional from Admin and Manager, always an active CSR. */
  private async resolveNewClientCsr(c: ActorContext, requested: string | undefined): Promise<string | null> {
    if (!requested || requested === "none") {
      if (c.actor.role === "CSR") throw new CsrRequiredException();
      return null;
    }
    await this.access.assert(c.actor, "assignNewClient", { csr: null }, c.requestId);
    return (await this.requireAssignableCsr(requested === "me" ? c.actor.id : requested)).id;
  }

  private async requireAssignableCsr(id: string): Promise<{ id: string; name: string }> {
    const csr = await this.repo.findCsr(id);
    if (!csr) throw new InvalidCsrAssignmentException("not-found");
    if (csr.role !== "CSR") throw new InvalidCsrAssignmentException("not-csr");
    if (csr.status !== "ACTIVE") throw new InvalidCsrAssignmentException("inactive");
    return csr;
  }

  private async actorName(c: ActorContext, tx: Prisma.TransactionClient): Promise<string> {
    const me = await tx.user.findUnique({ where: { id: c.actor.id }, select: { name: true } });
    return me?.name ?? "Your administrator";
  }

  private record(c: ActorContext, action: string, target: string, category: string, tx: Prisma.TransactionClient): Promise<void> {
    return this.audit.record({ actorId: c.actor.id, actorRole: c.actor.role, action, target, category, requestId: c.requestId, ipAddress: c.ipAddress }, tx);
  }
}
