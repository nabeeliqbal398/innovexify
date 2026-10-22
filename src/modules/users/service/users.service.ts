import { Injectable, Logger } from "@nestjs/common";
import { NotificationCategory, Prisma, type Role } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import {
  EmailInUseException,
  EmailUnchangedException,
  InvalidInviteRoleException,
  InvalidStateTransitionException,
  InvitationNotPendingException,
  LastAdminException,
  ReassignmentRequiredException,
  ResourceNotFoundException,
  SelfActionNotAllowedException,
  UserRemovedException,
  ValidationFailedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { MailService } from "../../../common/mail/mail.service";
import { emailChangedMail } from "../../../common/mail/templates";
import { NotificationService } from "../../../common/notifications/notification.service";
import { paginate, parseSort } from "../../../common/pagination/paginate";
import { AccessService } from "../../../common/permissions/access.service";
import type { Permission } from "../../../common/permissions/permissions";
import type { PaginatedResponse } from "../../../common/responses/api-response";
import { clientScope } from "../../../common/scope/scope";
import { InvitationService } from "../../auth/service/invitation.service";
import type {
  InviteUserDto,
  ListUsersQueryDto,
  NotificationPreferenceDto,
  UpdateNotificationPreferencesDto,
  UpdateUserEmailDto,
  UpdateUserNameDto,
  UpdateUserStatusDto,
  UserDto,
} from "../dto/users.dto";
import { USER_SORT_FIELDS, type UserRecord } from "../interfaces/users.interfaces";
import { UsersRepository } from "../repository/users.repository";

type Db = Prisma.TransactionClient;

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", MANAGER: "Manager", CSR: "CSR", COMPLIANCE: "Compliance", CLIENT: "Client" };
const STATUS_LABEL = { ACTIVE: "Active", INVITED: "Invited", SUSPENDED: "Suspended", REMOVED: "Removed" } as const;

export const toUserDto = (user: UserRecord): UserDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  status: user.status,
  invitedById: user.invitedById,
  lastLoginAt: user.lastLoginAt,
  caseNumber: user.clientProfile?.caseNumber ?? null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const isUniqueViolation = (error: unknown): boolean => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly repo: UsersRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly invitations: InvitationService,
    private readonly notifications: NotificationService,
    private readonly mail: MailService,
  ) {}

  // ---- reads --------------------------------------------------------------------------------------------------

  /** Admin and Manager only (the route enforces it), so there is no per-record scope: they see every account. */
  async list(query: ListUsersQueryDto): Promise<PaginatedResponse<UserDto>> {
    const sort = parseSort(query, USER_SORT_FIELDS, { field: "createdAt", order: "desc" });
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      // Removed accounts are hidden unless you ask for them by status.
      ...(query.status === "REMOVED" ? {} : { deletedAt: null }),
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [{ [sort.field]: sort.order }, { id: "asc" }];
    return paginate(query, ({ skip, take }) => this.repo.page(where, orderBy, skip, take), toUserDto);
  }

  async get(id: string): Promise<UserDto> {
    return toUserDto(await this.require(id));
  }

  // ---- invitations --------------------------------------------------------------------------------------------

  async invite(c: ActorContext, dto: InviteUserDto): Promise<UserDto> {
    if (dto.role === "ADMIN") throw new InvalidInviteRoleException("Admin accounts can't be created by invitation.");
    if (dto.role === "CLIENT") {
      throw new InvalidInviteRoleException("Invite clients from the Clients page (POST /clients), so their case is created with them.");
    }
    await this.access.assert(c.actor, `invite${dto.role}` as Permission, undefined, c.requestId, dto.email);
    await this.requireEmailFree(dto.email);

    const name = dto.name?.trim() || dto.email.split("@")[0] || dto.email;
    try {
      const user = await this.repo.transaction(async (tx) => {
        const created = await this.repo.create({ email: dto.email, name, role: dto.role, invitedById: c.actor.id }, tx);
        // The mail is the last step inside the transaction: if it can't be handed over, no account is left behind.
        await this.invitations.issueAndSend(
          { userId: created.id, email: created.email, name, role: created.role, invitedBy: await this.actorName(c, tx), note: dto.note },
          tx,
        );
        await this.record(c, `Invited ${ROLE_LABEL[dto.role]} ${dto.email}`, created.email, tx);
        return created;
      });
      return toUserDto(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailInUseException(dto.email);
      throw error;
    }
  }

  async resendInvitation(c: ActorContext, id: string): Promise<UserDto> {
    const target = await this.requireVisibleTo(c, id);
    if (target.status === "REMOVED") throw new UserRemovedException(target.name);
    if (target.role === "ADMIN") throw new InvalidInviteRoleException("Admin accounts can't be created by invitation.");
    await this.access.assert(c.actor, `invite${target.role}` as Permission, undefined, c.requestId, target.email);
    if (target.status !== "INVITED") throw new InvitationNotPendingException(target.name, STATUS_LABEL[target.status]);

    await this.repo.transaction(async (tx) => {
      await this.invitations.issueAndSend(
        {
          userId: target.id,
          email: target.email,
          name: target.name,
          role: target.role,
          invitedBy: await this.actorName(c, tx),
          caseNumber: target.clientProfile?.caseNumber,
        },
        tx,
      );
      await this.record(c, `Resent invitation to ${target.email}`, target.clientProfile?.caseNumber ?? target.email, tx);
    });
    return toUserDto(target);
  }

  // ---- edits --------------------------------------------------------------------------------------------------

  async rename(c: ActorContext, id: string, dto: UpdateUserNameDto): Promise<UserDto> {
    const target = await this.require(id);
    if (target.status === "REMOVED") throw new UserRemovedException(target.name);
    const own = target.id === c.actor.id;
    // Your own name is yours to change. Someone else's follows the same rule as their email (who may touch whom).
    if (!own) await this.access.assert(c.actor, "updateEmail", { id: target.id, role: target.role }, c.requestId, target.email);
    if (dto.name === target.name) return toUserDto(target);

    const updated = await this.repo.transaction(async (tx) => {
      const user = await this.repo.update(target.id, { name: dto.name }, tx);
      await this.record(c, own ? "Updated own profile" : `Renamed ${target.name} to ${dto.name}`, target.clientProfile?.caseNumber ?? target.email, tx);
      return user;
    });
    return toUserDto(updated);
  }

  async changeEmail(c: ActorContext, id: string, dto: UpdateUserEmailDto): Promise<UserDto> {
    const target = await this.require(id);
    if (target.status === "REMOVED") throw new UserRemovedException(target.name);
    await this.access.assert(c.actor, "updateEmail", { id: target.id, role: target.role }, c.requestId, target.email);
    if (dto.email === target.email.toLowerCase()) throw new EmailUnchangedException(target.email);
    await this.requireEmailFree(dto.email, target.id);

    const previous = target.email;
    try {
      const updated = await this.repo.transaction(async (tx) => {
        const user = await this.repo.update(target.id, { email: dto.email }, tx);
        // Someone who hasn't accepted yet holds a link that was sent to the old address: replace it.
        if (target.status === "INVITED") {
          await this.invitations.issueAndSend(
            {
              userId: target.id,
              email: dto.email,
              name: target.name,
              role: target.role,
              invitedBy: await this.actorName(c, tx),
              caseNumber: target.clientProfile?.caseNumber,
            },
            tx,
          );
        }
        await this.notifications.notify(tx, { userIds: [target.id], text: `Your login email was changed to ${dto.email}`, link: "settings" });
        await this.record(c, `Changed email for ${target.name} from ${previous} to ${dto.email}`, target.clientProfile?.caseNumber ?? target.name, tx);
        return user;
      });
      await this.noticeToOldAddress(previous, target.name, dto.email);
      return toUserDto(updated);
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailInUseException(dto.email);
      throw error;
    }
  }

  async setStatus(c: ActorContext, id: string, dto: UpdateUserStatusDto): Promise<UserDto> {
    const target = await this.require(id);
    if (target.status === "REMOVED") throw new UserRemovedException(target.name);
    const suspending = dto.status === "SUSPENDED";
    if (suspending && target.id === c.actor.id) throw new SelfActionNotAllowedException("suspend");
    await this.access.assert(c.actor, "suspendUser", { id: target.id, role: target.role }, c.requestId, target.email);

    const needed = suspending ? "ACTIVE" : "SUSPENDED";
    if (target.status !== needed) {
      const reason =
        target.status === dto.status
          ? `This account is already ${dto.status.toLowerCase()}.`
          : target.status === "INVITED"
            ? "This person hasn't accepted their invitation yet. Resend it, or remove the account to cancel it."
            : suspending
              ? "Only active accounts can be suspended."
              : "Only suspended accounts can be reactivated.";
      throw new InvalidStateTransitionException("account", STATUS_LABEL[target.status], STATUS_LABEL[dto.status], reason);
    }

    const updated = await this.repo.transaction(async (tx) => {
      if (suspending && target.role === "ADMIN" && (await this.repo.countOtherActiveAdmins(target.id, tx)) === 0) {
        throw new LastAdminException("suspend");
      }
      const user = await this.repo.update(target.id, { status: dto.status }, tx);
      // Suspension is immediate: the refresh tokens die here, and the access token is refused on its next use
      // because JwtAuthGuard re-reads the account status on every request.
      const ended = suspending ? await this.repo.revokeSessions(target.id, tx) : 0;
      const why = dto.reason ? ` · reason: ${dto.reason}` : "";
      const verb = suspending ? `Suspended ${target.name} (${ended} session${ended === 1 ? "" : "s"} ended)` : `Reactivated ${target.name}`;
      await this.record(c, `${verb}${why}`, target.clientProfile?.caseNumber ?? target.email, tx);
      return user;
    });
    return toUserDto(updated);
  }

  async remove(c: ActorContext, id: string): Promise<UserDto> {
    const target = await this.require(id);
    if (target.status === "REMOVED") throw new UserRemovedException(target.name);
    if (target.id === c.actor.id) throw new SelfActionNotAllowedException("remove");
    await this.access.assert(c.actor, "removeUser", { id: target.id, role: target.role }, c.requestId, target.email);

    const removed = await this.repo.transaction(async (tx) => {
      if (target.role === "ADMIN" && target.status === "ACTIVE" && (await this.repo.countOtherActiveAdmins(target.id, tx)) === 0) {
        throw new LastAdminException("remove");
      }
      // Anyone who works tasks must hand them over first; only a CSR can also hold clients.
      if (target.role !== "CLIENT") {
        const load = await this.repo.reassignmentLoad(target.id, tx);
        if (load.clients || load.openTasks) throw new ReassignmentRequiredException(target.name, load.clients, load.openTasks);
      }
      const user = await this.repo.markRemoved(target.id, tx);
      const sessions = await this.repo.revokeSessions(target.id, tx);
      await this.repo.expireInvitations(target.id, tx);
      const cases = target.role === "CLIENT" ? await this.repo.softDeleteCasesOf(target.id, tx) : 0;
      const extra = [
        sessions ? `${sessions} session${sessions === 1 ? "" : "s"} ended` : "",
        cases ? `${cases} case${cases === 1 ? "" : "s"} closed to edits` : "",
      ].filter(Boolean);
      await this.record(c, `Removed ${target.name} from the portal${extra.length ? ` (${extra.join(", ")})` : ""}`, target.clientProfile?.caseNumber ?? target.email, tx);
      return user;
    });
    return toUserDto(removed);
  }

  // ---- notification preferences ---------------------------------------------------------------------------------

  async notificationPreferences(userId: string): Promise<NotificationPreferenceDto[]> {
    return this.fullPreferences(userId);
  }

  async updateNotificationPreferences(c: ActorContext, dto: UpdateNotificationPreferencesDto): Promise<NotificationPreferenceDto[]> {
    const seen = new Set<string>();
    const errors = dto.preferences.flatMap((item, i) => {
      const out: Array<{ field: string; message: string }> = [];
      if (seen.has(item.category)) out.push({ field: `preferences.${i}.category`, message: `${item.category} is listed more than once.` });
      seen.add(item.category);
      if (item.email === undefined && item.inApp === undefined) {
        out.push({ field: `preferences.${i}`, message: `Say whether to turn ${item.category} email, in-app, or both on or off.` });
      }
      return out;
    });
    if (errors.length) throw new ValidationFailedException(errors);

    await this.repo.transaction(async (tx) => {
      for (const item of dto.preferences) {
        await this.repo.upsertPreference(c.actor.id, item.category, { email: item.email, inApp: item.inApp }, tx);
      }
      const summary = dto.preferences
        .map((p) => `${p.category}${p.email === undefined ? "" : ` email ${p.email ? "on" : "off"}`}${p.inApp === undefined ? "" : ` in-app ${p.inApp ? "on" : "off"}`}`)
        .join(", ");
      await this.record(c, `Updated own notification preferences (${summary})`, c.actor.email, tx);
    });
    return this.fullPreferences(c.actor.id);
  }

  /** Every category, with the default (both on) for the ones the user never changed. */
  private async fullPreferences(userId: string): Promise<NotificationPreferenceDto[]> {
    const stored = new Map((await this.repo.preferencesOf(userId)).map((p) => [p.category, p]));
    return Object.values(NotificationCategory).map((category) => ({
      category,
      email: stored.get(category)?.email ?? true,
      inApp: stored.get(category)?.inApp ?? true,
    }));
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /** Admin and Manager may open any account, removed ones included (read-only). */
  private async require(id: string): Promise<UserRecord> {
    const user = await this.repo.findOne({ id });
    if (!user) throw new ResourceNotFoundException("user", id);
    return user;
  }

  /** Resending an invitation is also open to a CSR, but only for the clients in their own scope. */
  private async requireVisibleTo(c: ActorContext, id: string): Promise<UserRecord> {
    if (c.actor.role !== "CSR") return this.require(id);
    const user = await this.repo.findOne({ AND: [{ id, role: "CLIENT" }, clientScope(c.actor)] });
    if (!user) throw new ResourceNotFoundException("user", id);
    return user;
  }

  private async requireEmailFree(email: string, exceptUserId?: string): Promise<void> {
    const holder = await this.repo.findHoldingEmail(email);
    if (holder && holder.id !== exceptUserId) throw new EmailInUseException(email);
  }

  private async actorName(c: ActorContext, tx: Db): Promise<string> {
    const me = await tx.user.findUnique({ where: { id: c.actor.id }, select: { name: true } });
    return me?.name ?? "Your administrator";
  }

  private record(c: ActorContext, action: string, target: string, tx: Db): Promise<void> {
    return this.audit.record(
      { actorId: c.actor.id, actorRole: c.actor.role, action, target, category: "users", requestId: c.requestId, ipAddress: c.ipAddress },
      tx,
    );
  }

  /** A courtesy notice to the previous address. A failure is logged, never a reason to undo the change. */
  private async noticeToOldAddress(oldEmail: string, name: string, newEmail: string): Promise<void> {
    try {
      await this.mail.send(emailChangedMail({ to: oldEmail, name, newEmail, companyName: await this.notifications.companyName() }));
    } catch (error) {
      this.logger.warn(`Could not email the old address ${oldEmail}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
