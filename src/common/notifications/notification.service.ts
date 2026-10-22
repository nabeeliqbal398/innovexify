import { Global, Injectable, Logger, Module } from "@nestjs/common";
import type { NotificationCategory, Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { notificationMail } from "../mail/templates";

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
      await tx.notification.createMany({ data: inApp.map((u) => ({ userId: u.id, text: input.text.slice(0, 500), link: input.link })) });
    }
    return input.category ? users.filter((u) => prefOf.get(u.id)?.email ?? true) : [];
  }

  /** Sends the notification email to each recipient. Failures are logged and never thrown: use after the commit. */
  async emailAfterCommit(recipients: readonly EmailRecipient[], text: string): Promise<void> {
    if (recipients.length === 0) return;
    const companyName = await this.companyName();
    await Promise.all(
      recipients.map((r) =>
        this.mail.send(notificationMail({ to: r.email, name: r.name, text, companyName })).catch((error: unknown) => {
          this.logger.warn(`Could not email ${r.email}: ${error instanceof Error ? error.message : String(error)}`);
        }),
      ),
    );
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
