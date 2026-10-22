import { Injectable } from "@nestjs/common";
import type { Prisma, Role } from "@prisma/client";
import * as argon2 from "argon2";

import { AuditService } from "../../../common/audit/audit.service";
import { MailService } from "../../../common/mail/mail.service";
import { invitationMail } from "../../../common/mail/templates";
import { NotificationService } from "../../../common/notifications/notification.service";
import { InvitationExpiredException, InvitationInvalidException, InvitationUsedException } from "../../../common/exceptions";
import { AppConfig } from "../../../config/app-config";
import type { AuthSession, ClientContext } from "../interfaces/auth.interfaces";
import { AuthRepository, type InvitationRecord } from "../repository/auth.repository";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import type { InvitationLookupDto } from "../dto/auth.dto";

const DAY_MS = 86_400_000;

export interface InvitationMailDetails {
  userId: string;
  email: string;
  name: string;
  role: Role;
  invitedBy: string;
  note?: string;
  caseNumber?: string | null;
}

@Injectable()
export class InvitationService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Create an invitation link for a user who was just invited (or re-invited). Returns the raw token once;
   * only its hash is stored. The users module calls this when it sends the invitation email.
   */
  async issue(userId: string, tx?: Prisma.TransactionClient): Promise<{ token: string; url: string; expiresAt: Date }> {
    const token = this.tokens.generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.env.INVITATION_TTL_DAYS * DAY_MS);
    await this.repo.createInvitation(userId, this.tokens.hash(token), expiresAt, tx);
    return { token, url: `${this.config.env.APP_URL}/invite/${token}`, expiresAt };
  }

  /**
   * Issue the link and email it through MailService. Pass the caller's transaction to make the token part of it:
   * if the mail can't be handed over this throws, and the caller's transaction (user, token, ...) rolls back.
   */
  async issueAndSend(invite: InvitationMailDetails, tx?: Prisma.TransactionClient): Promise<{ expiresAt: Date }> {
    const link = await this.issue(invite.userId, tx);
    await this.sendInvitation(invite, link, tx);
    return { expiresAt: link.expiresAt };
  }

  /**
   * Emails an already-issued link; rejects when the mail can't be handed over. The clients module issues the link
   * inside its transaction and calls this after the commit, so a mail outage never undoes a created client.
   */
  async sendInvitation(invite: InvitationMailDetails, link: { url: string; expiresAt: Date }, tx?: Prisma.TransactionClient): Promise<void> {
    const companyName = await this.notifications.companyName(tx);
    await this.mail.send(
      invitationMail({
        to: invite.email,
        name: invite.name,
        role: invite.role,
        companyName,
        invitedBy: invite.invitedBy,
        url: link.url,
        expiresAt: link.expiresAt,
        note: invite.note,
        caseNumber: invite.caseNumber,
      }),
    );
  }

  /** What the invitation page shows before the person chooses a password. Never reveals the token's hash. */
  async lookup(rawToken: string): Promise<InvitationLookupDto> {
    const invitation = await this.requireUsable(rawToken);
    const { user } = invitation;
    return {
      email: user.email,
      name: user.name,
      role: user.role,
      caseNumber: user.clientProfile?.caseNumber ?? null,
      invitedBy: user.invitedBy?.name ?? null,
      expiresAt: invitation.expiresAt,
    };
  }

  /** Set the password, activate the account, burn the invitation, and sign the person in. */
  async accept(rawToken: string, password: string, ctx: ClientContext): Promise<AuthSession> {
    const invitation = await this.requireUsable(rawToken);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const accepted = await this.repo.acceptInvitation(invitation.id, invitation.userId, passwordHash);
    if (!accepted) throw new InvitationUsedException();

    const { user } = invitation;
    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      action: "Invitation accepted",
      target: user.clientProfile?.caseNumber ?? user.email,
      category: "invites",
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });
    if (user.clientProfile?.csrId) {
      await this.repo.notifyUser(user.clientProfile.csrId, `${user.name} accepted the invitation`, "clients");
    }
    return this.auth.openSession(user.id, invitation.id, ctx);
  }

  /** Looks the token up by hash and rejects unknown, used and expired invitations with distinct messages. */
  private async requireUsable(rawToken: string): Promise<InvitationRecord> {
    const invitation = await this.repo.findInvitation(this.tokens.hash(rawToken));
    if (!invitation) throw new InvitationInvalidException();
    if (invitation.usedAt || invitation.user.status === "ACTIVE") throw new InvitationUsedException();
    if (invitation.expiresAt <= new Date()) throw new InvitationExpiredException();
    if (invitation.user.status !== "INVITED") throw new InvitationInvalidException();
    return invitation;
  }
}
