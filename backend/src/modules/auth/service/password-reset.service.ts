import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import * as argon2 from "argon2";

import { AuditService } from "../../../common/audit/audit.service";
import { normaliseEmail } from "../../../common/decorators/throttle.decorators";
import { PasswordResetExpiredException, PasswordResetInvalidException, PasswordResetUsedException } from "../../../common/exceptions";
import { MailService, type MailMessage } from "../../../common/mail/mail.service";
import { passwordChangedMail, passwordResetMail } from "../../../common/mail/templates";
import { NotificationService } from "../../../common/notifications/notification.service";
import { AppConfig } from "../../../config/app-config";
import type { ClientContext } from "../interfaces/auth.interfaces";
import { AuthRepository, type PasswordResetRecord } from "../repository/auth.repository";
import { TokenService } from "./token.service";

const MINUTE_MS = 60_000;
/** Asking again inside this window sends nothing new: one address cannot be used to flood someone's mailbox. */
const MIN_GAP_MS = MINUTE_MS;

/** What every forgot-password request answers, whether or not the account exists. */
export const FORGOT_PASSWORD_MESSAGE = "If an account exists for that email, we've sent a link to reset the password.";

/**
 * Password reset by email. Same approach as invitations: the link carries a random token, only its SHA-256 hash is stored,
 * the hash is compared in constant time, and the link works once.
 */
@Injectable()
export class PasswordResetService implements OnApplicationShutdown {
  private readonly logger = new Logger(PasswordResetService.name);
  /** Emails handed to the mail server but not yet finished, so shutdown (and tests) can wait for them. */
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Ask for a reset link. Resolves the same way for an unknown email, a suspended or removed account and a real one; the
   * controller answers with the same message every time. Both paths generate a token, hit the database and write an audit
   * entry, and the email is handed to the mail server after the answer is ready, so how long the SMTP server takes cannot
   * be used to tell the paths apart. (Timing is not otherwise equalised to the microsecond.)
   */
  async request(email: string, ctx: ClientContext): Promise<void> {
    const address = normaliseEmail(email) ?? "";
    const user = await this.repo.findResettableUser(address);
    const token = this.tokens.generateOpaqueToken();
    const tokenHash = this.tokens.hash(token);

    if (!user || user.status !== "ACTIVE") {
      await this.repo.decoyRoundTrip();
      await this.record(null, null, "Refused: password reset requested for an unknown or inactive account (no email sent)", address, false, ctx);
      return;
    }

    const last = await this.repo.latestPasswordResetAt(user.id);
    if (last && Date.now() - last.getTime() < MIN_GAP_MS) {
      await this.record(user.id, user.role, "Password reset requested again within a minute (no new email sent)", address, false, ctx);
      return;
    }

    const ttlMinutes = this.config.env.PASSWORD_RESET_TTL_MINUTES;
    await this.repo.createPasswordReset(user.id, tokenHash, new Date(Date.now() + ttlMinutes * MINUTE_MS), ctx.ipAddress);
    await this.record(user.id, user.role, "Password reset requested", address, true, ctx);

    const url = `${this.config.env.APP_URL}/reset-password/${token}`;
    this.track(this.deliver(async () => passwordResetMail({ to: user.email, name: user.name, companyName: await this.notifications.companyName(), url, expiresInMinutes: ttlMinutes })));
  }

  /** Resolves when every email already handed over has finished (sent or failed). */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.idle();
  }

  private track(delivery: Promise<void>): void {
    this.pending.add(delivery);
    void delivery.finally(() => this.pending.delete(delivery));
  }

  /** What the reset page needs before it shows the form: the link is usable, and until when. */
  async lookup(rawToken: string): Promise<{ expiresAt: Date }> {
    const reset = await this.requireUsable(rawToken);
    return { expiresAt: reset.expiresAt };
  }

  /** Set the new password, burn the link and end every session, atomically; then tell the person by email. */
  async reset(rawToken: string, newPassword: string, ctx: ClientContext): Promise<{ sessionsEnded: number }> {
    const reset = await this.requireUsable(rawToken);
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    const outcome = await this.repo.completePasswordReset(reset.id, reset.userId, passwordHash);
    if (outcome === "inactive") throw new PasswordResetInvalidException();
    if (outcome === "used") throw new PasswordResetUsedException();

    const { user } = reset;
    const { sessionsEnded } = outcome;
    await this.record(user.id, user.role, `Password reset completed; ${sessionsEnded} session${sessionsEnded === 1 ? "" : "s"} ended`, user.email, true, ctx);
    // Always on: not one of the switchable notifications. A mail failure does not undo the reset (the password is already changed).
    await this.deliver(async () => passwordChangedMail({ to: user.email, name: user.name, companyName: await this.notifications.companyName(), at: new Date() }));
    return { sessionsEnded };
  }

  /** Unknown, used, expired, or belonging to an account that can no longer reset: each says what the person can do about it. */
  private async requireUsable(rawToken: string): Promise<PasswordResetRecord> {
    const reset = await this.repo.findPasswordReset(this.tokens.hash(rawToken));
    if (!reset || !this.tokens.matches(rawToken, reset.tokenHash)) throw new PasswordResetInvalidException();
    // Suspended and removed accounts get no reset, and are not told why.
    if (reset.user.status !== "ACTIVE" || reset.user.deletedAt) throw new PasswordResetInvalidException();
    if (reset.usedAt) throw new PasswordResetUsedException();
    if (reset.expiresAt <= new Date()) throw new PasswordResetExpiredException();
    return reset;
  }

  /** Build and send a message without ever throwing: the caller has already done what matters. */
  private async deliver(build: () => Promise<MailMessage>): Promise<void> {
    try {
      await this.mail.send(await build());
    } catch (error) {
      this.logger.error(`Password email was not delivered: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private record(actorId: string | null, role: Parameters<AuditService["record"]>[0]["actorRole"], action: string, target: string, ok: boolean, ctx: ClientContext): Promise<void> {
    return this.audit.record({ actorId, actorRole: role, action, target, ok, category: "auth", requestId: ctx.requestId, ipAddress: ctx.ipAddress });
  }
}
