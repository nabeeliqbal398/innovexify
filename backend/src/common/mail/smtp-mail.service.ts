import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

import { MailService, type MailMessage } from "./mail.service";

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  /** The From header. */
  from: string;
  /** Refuse to talk to a server that does not offer encryption (port 465, or STARTTLS). */
  requireTls: boolean;
}

/**
 * Sends email through an SMTP server (nodemailer). Port 465 uses TLS from the first byte; any other port must upgrade with
 * STARTTLS unless the settings say plain SMTP is acceptable. `send` rejects when the server does not accept the message,
 * so a caller inside a transaction can roll back.
 */
@Injectable()
export class SmtpMailService extends MailService {
  private readonly logger = new Logger("Mail");
  private readonly transporter: Transporter;

  constructor(private readonly settings: SmtpSettings) {
    super();
    this.transporter = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      requireTLS: settings.requireTls && settings.port !== 465,
      auth: { user: settings.user, pass: settings.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.settings.from, to: message.to, subject: message.subject, text: message.text });
    } catch (error) {
      // Never log the message: reset links and invitation links are secrets.
      this.logger.error(`Could not send ${message.kind} email to ${message.to}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`The email could not be sent (${message.kind}).`);
    }
    this.logger.log(`Sent ${message.kind} email to ${message.to}`);
  }
}
