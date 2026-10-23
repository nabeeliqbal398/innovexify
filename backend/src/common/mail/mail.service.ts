import { appendFile } from "node:fs/promises";

import { Global, Injectable, Logger, Module } from "@nestjs/common";

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. */
  text: string;
  /** What kind of email this is, for logs and later for per-template switches. */
  kind: "invitation" | "email-change" | "notification";
  /** The email template chosen for this kind of message in Notifications & automation, when one applies. */
  template?: string;
}

/**
 * Outgoing email. Services depend on this abstract class, never on a transport, so a real SMTP (or provider API)
 * implementation can replace LogMailService in MailModule without touching any caller.
 * `send` must reject when the message could not be handed over, so a caller inside a transaction can roll back.
 */
export abstract class MailService {
  abstract send(message: MailMessage): Promise<void>;
}

/**
 * Development stand-in: writes the email to the application log and sends nothing. When MAIL_OUTBOX_FILE is set (never in
 * production) each message is also appended to that file as one JSON line, so a browser test can read an invitation link.
 */
@Injectable()
export class LogMailService extends MailService {
  private readonly logger = new Logger("Mail");

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`[email not sent: LogMailService] ${message.kind}${message.template ? ` (${message.template})` : ""} to ${message.to}\nSubject: ${message.subject}\n${message.text}`);
    const outbox = process.env.MAIL_OUTBOX_FILE;
    if (outbox && process.env.NODE_ENV !== "production") await appendFile(outbox, `${JSON.stringify({ at: new Date().toISOString(), ...message })}\n`);
  }
}

@Global()
@Module({ providers: [{ provide: MailService, useClass: LogMailService }], exports: [MailService] })
export class MailModule {}
