import { Global, Injectable, Logger, Module } from "@nestjs/common";
import type { NotificationCategory, Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { safeLink } from "./notification-links";
import { notificationMail } from "../mail/templates";

/** The automation triggers (Notifications & automation). Each one governs one kind of EMAIL; in-app notifications are never affected. */
export type TriggerKey = "inv" | "msg" | "ticket" | "docreq" | "sec";

export interface TriggerState {
  enabled: boolean;
  template: string;
}

export interface NotifyInput {
  /** Recipients. Empty values and duplicates are ignored. */
  userIds: ReadonlyArray<string | null | undefined>;
  text: string;
  /** The view the notification opens. */
  link: string;
  /**
   * The recipient's preference category. When given, the user's in-app and email switches for it are honoured
   * (both default to on). When omitted the notification is a system message: in-app only, always delivered.
   */
  category?: NotificationCategory;
  /** The person who caused the change; they don't need to be told about their own action. */
  excludeUserId?: string;
}

export interface EmailRecipient {
  id: string;
  name: string;
  email: string;
}

/**
 * In-app notifications and the emails that go with them, according to each user's notification preferences.
 * The in-app rows are written with the caller's transaction client, so they commit or roll back with the change that
 * caused them. Emails are returned, not sent, so the caller decides whether they belong inside the transaction.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async notify(tx: Prisma.TransactionClient, input: NotifyInput): Promise<EmailRecipient[]> {
    const ids = [...new Set(input.userIds.filter((id): id is string => Boolean(id) && id !== input.excludeUserId))];
    if (ids.length === 0) return [];

    const users = await tx.user.findMany({
      where: { id: { in: ids }, deletedAt: null, status: { not: "REMOVED" } },
      select: { id: true, name: true, email: true },
    });
    const prefs = input.category
      ? await tx.notificationPreference.findMany({ where: { userId: { in: ids }, category: input.category }, select: { userId: true, email: true, inApp: true } })
      : [];
    const prefOf = new Map(prefs.map((p) => [p.userId, p]));

    const inApp = users.filter((u) => prefOf.get(u.id)?.inApp ?? true);
    if (inApp.length) {
      await tx.notification.createMany({ data: inApp.map((u) => ({ userId: u.id, text: input.text.slice(0, 500), link: safeLink(input.link) })) });
    }
    return input.category ? users.filter((u) => prefOf.get(u.id)?.email ?? true) : [];
  }

  /**
   * Whether the trigger's emails are switched on, and which template to use. A security trigger is always on, whatever its
   * stored switch says. A trigger that has no row yet counts as on.
   */
  async trigger(key: TriggerKey, db: Prisma.TransactionClient = this.prisma): Promise<TriggerState> {
    const row = await db.notificationTrigger.findUnique({ where: { key }, select: { enabled: true, security: true, template: true } });
    return { enabled: row ? row.enabled || row.security : true, template: row?.template ?? "" };
  }

  /**
   * Sends the notification email to each recipient. Failures are logged and never thrown: use after the commit.
   * With a `trigger`, a trigger that has been switched off suppresses the email (the in-app notification already written is not touched).
   */
  async emailAfterCommit(recipients: readonly EmailRecipient[], text: string, trigger?: TriggerKey): Promise<void> {
    if (recipients.length === 0) return;
    let template: string | undefined;
    if (trigger) {
      const state = await this.trigger(trigger);
      if (!state.enabled) {
        this.logger.log(`Trigger "${trigger}" is off: ${recipients.length} email(s) not sent.`);
        return;
      }
      template = state.template || undefined;
    }
    const companyName = await this.companyName();
    await Promise.all(
      recipients.map((r) =>
        this.mail.send(notificationMail({ to: r.email, name: r.name, text, companyName, template })).catch((error: unknown) => {
          this.logger.warn(`Could not email ${r.email}: ${error instanceof Error ? error.message : String(error)}`);
        }),
      ),
    );
  }

  /** Everyone who works a client's case (the prototype's teamFor): active Admin, Manager and Compliance users, plus the assigned CSR. */
  async teamOf(clientId: string, db: Prisma.TransactionClient = this.prisma): Promise<string[]> {
    const [staff, profile] = await Promise.all([
      db.user.findMany({ where: { role: { in: ["ADMIN", "MANAGER", "COMPLIANCE"] }, status: "ACTIVE", deletedAt: null }, select: { id: true } }),
      db.clientProfile.findUnique({ where: { userId: clientId }, select: { csrId: true } }),
    ]);
    return [...staff.map((u) => u.id), ...(profile?.csrId ? [profile.csrId] : [])];
  }

  async companyName(db: Prisma.TransactionClient = this.prisma): Promise<string> {
    const company = await db.company.findUnique({ where: { id: 1 }, select: { name: true } });
    return company?.name ?? "Innovexify";
  }

  async casePrefix(db: Prisma.TransactionClient = this.prisma): Promise<string> {
    const company = await db.company.findUnique({ where: { id: 1 }, select: { casePrefix: true } });
    return company?.casePrefix ?? "CASE";
  }
}

@Global()
@Module({ providers: [NotificationService], exports: [NotificationService] })
export class NotificationsModule {}
