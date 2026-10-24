import { parseEnv } from "./env";

const BASE = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/innovexify_test",
  JWT_ACCESS_SECRET: "x".repeat(40),
};
const SMTP = { MAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "user", SMTP_PASSWORD: "secret", MAIL_FROM: "Innovexify <no-reply@example.com>" };

describe("environment: mail", () => {
  it("defaults to the log transport outside production", () => {
    expect(parseEnv({ ...BASE, NODE_ENV: "development" }).MAIL_TRANSPORT).toBe("log");
  });

  it("refuses to start in production with the log transport (the default), naming what to set", () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: "production" })).toThrow(/MAIL_TRANSPORT: MAIL_TRANSPORT=log .* not allowed when NODE_ENV=production/);
    expect(() => parseEnv({ ...BASE, NODE_ENV: "production", MAIL_TRANSPORT: "log" })).toThrow(/not allowed when NODE_ENV=production/);
  });

  it("accepts production with a complete SMTP configuration", () => {
    const env = parseEnv({ ...BASE, NODE_ENV: "production", ...SMTP });
    expect(env).toMatchObject({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: 587, SMTP_USER: "user", MAIL_FROM: "Innovexify <no-reply@example.com>", SMTP_ALLOW_PLAINTEXT: false });
  });

  it.each(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"])("fails fast when MAIL_TRANSPORT=smtp and %s is missing", (name) => {
    const source: NodeJS.ProcessEnv = { ...BASE, ...SMTP };
    delete source[name];
    expect(() => parseEnv(source)).toThrow(new RegExp(`${name} is required when MAIL_TRANSPORT=smtp`));
  });

  it("treats an empty value (compose passes SMTP_HOST= when unset) as missing", () => {
    expect(() => parseEnv({ ...BASE, ...SMTP, SMTP_HOST: "" })).toThrow(/SMTP_HOST is required/);
  });

  it("rejects an unknown transport", () => {
    expect(() => parseEnv({ ...BASE, MAIL_TRANSPORT: "carrier-pigeon" })).toThrow(/MAIL_TRANSPORT must be smtp or log/);
  });

  it("lists every missing setting at once", () => {
    expect(() => parseEnv({ ...BASE, MAIL_TRANSPORT: "smtp" })).toThrow(/SMTP_HOST[\s\S]*SMTP_PORT[\s\S]*SMTP_USER[\s\S]*SMTP_PASSWORD[\s\S]*MAIL_FROM/);
  });
});

describe("environment: CORS_ORIGINS", () => {
  it("is empty in production unless set, so the API sends no CORS headers behind the proxy", () => {
    expect(parseEnv({ ...BASE, NODE_ENV: "production", ...SMTP }).CORS_ORIGINS).toEqual([]);
    expect(parseEnv({ ...BASE, NODE_ENV: "production", ...SMTP, CORS_ORIGINS: "" }).CORS_ORIGINS).toEqual([]);
  });
  it("defaults to the local web app in development", () => {
    expect(parseEnv({ ...BASE, NODE_ENV: "development" }).CORS_ORIGINS).toEqual(["http://localhost:3000"]);
  });
  it("still honours an explicit list", () => {
    expect(parseEnv({ ...BASE, CORS_ORIGINS: "https://a.example, https://b.example" }).CORS_ORIGINS).toEqual(["https://a.example", "https://b.example"]);
  });
});

describe("environment: TRUST_PROXY and limits", () => {
  it.each([
    ["false", false],
    ["true", 1],
    ["1", 1],
    ["2", 2],
  ])("reads %s as %p", (value, expected) => {
    expect(parseEnv({ ...BASE, TRUST_PROXY: value }).TRUST_PROXY).toBe(expected);
  });
  it("defaults to no proxy", () => {
    expect(parseEnv(BASE).TRUST_PROXY).toBe(false);
  });
  it.each(["all", "0", "-1", "11", "1.5"])("rejects %s", (value) => {
    expect(() => parseEnv({ ...BASE, TRUST_PROXY: value })).toThrow(/TRUST_PROXY must be false/);
  });
  it("gives refresh its own, much higher default limit than sign-in", () => {
    const env = parseEnv(BASE);
    expect(env.AUTH_THROTTLE_LIMIT).toBe(5);
    expect(env.REFRESH_THROTTLE_LIMIT).toBe(120); // per session
    expect(env.REFRESH_IP_CEILING).toBe(1200); // per address, a backstop
    expect(parseEnv({ ...BASE, REFRESH_THROTTLE_LIMIT: "300" }).REFRESH_THROTTLE_LIMIT).toBe(300);
  });
});
