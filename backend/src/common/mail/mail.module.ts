import { Global, Module } from "@nestjs/common";

import { AppConfig } from "../../config/app-config";
import { LogMailService, MailService } from "./mail.service";
import { SmtpMailService } from "./smtp-mail.service";

/** MAIL_TRANSPORT picks the implementation. env.ts has already checked that smtp has its settings, and that production never uses log. */
export function createMailService(config: AppConfig): MailService {
  const { env } = config;
  if (env.MAIL_TRANSPORT === "smtp") {
    return new SmtpMailService({
      host: env.SMTP_HOST as string,
      port: env.SMTP_PORT as number,
      user: env.SMTP_USER as string,
      password: env.SMTP_PASSWORD as string,
      from: env.MAIL_FROM as string,
      requireTls: config.isProduction && !env.SMTP_ALLOW_PLAINTEXT,
    });
  }
  // Belt and braces: the environment check already refuses this combination.
  if (config.isProduction) throw new Error("LogMailService must not be used when NODE_ENV=production.");
  return new LogMailService();
}

@Global()
@Module({ providers: [{ provide: MailService, inject: [AppConfig], useFactory: createMailService }], exports: [MailService] })
export class MailModule {}
