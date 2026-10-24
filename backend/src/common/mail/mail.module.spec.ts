import type { AppConfig } from "../../config/app-config";
import { parseEnv } from "../../config/env";
import { createMailService } from "./mail.module";
import { LogMailService } from "./mail.service";
import { SmtpMailService } from "./smtp-mail.service";

const BASE = { DATABASE_URL: "postgresql://u:p@localhost:5432/x_test", JWT_ACCESS_SECRET: "x".repeat(40) };
const SMTP = { MAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "user", SMTP_PASSWORD: "secret", MAIL_FROM: "no-reply@example.com" };
const config = (source: NodeJS.ProcessEnv): AppConfig => {
  const env = parseEnv(source);
  return { env, isProduction: env.NODE_ENV === "production" } as AppConfig;
};

describe("createMailService", () => {
  it("builds the SMTP service when MAIL_TRANSPORT=smtp", () => {
    expect(createMailService(config({ ...BASE, ...SMTP }))).toBeInstanceOf(SmtpMailService);
  });
  it("builds the log service outside production", () => {
    expect(createMailService(config({ ...BASE, NODE_ENV: "development" }))).toBeInstanceOf(LogMailService);
  });
  it("refuses the log service in production even if the environment check were bypassed", () => {
    const bypassed = { env: { ...parseEnv({ ...BASE, ...SMTP, NODE_ENV: "production" }), MAIL_TRANSPORT: "log" }, isProduction: true } as AppConfig;
    expect(() => createMailService(bypassed)).toThrow(/must not be used when NODE_ENV=production/);
  });
});
