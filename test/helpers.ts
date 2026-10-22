import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import type { CaseStage, CaseStatus, Priority, Role, UserStatus } from "@prisma/client";
import * as argon2 from "argon2";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { MailService, type MailMessage } from "../src/common/mail/mail.service";
import { TokenService } from "../src/modules/auth/service/token.service";
import { configureApp } from "../src/app.setup";
import { AppConfig } from "../src/config/app-config";
import { PrismaService } from "../src/prisma/prisma.service";
import { ProbeController } from "./probe.controller";

export const PASSWORD = "Correct-Horse-9Battery";
let passwordHash: Promise<string> | undefined;
const hashOnce = (): Promise<string> => (passwordHash ??= argon2.hash(PASSWORD, { type: argon2.argon2id }));

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/**
 * Boots the real application (same setup as main.ts) with a probe controller for permission and error tests.
 * `configure` can replace providers (for example a MailService that throws) before the app is built.
 */
export async function createApp(
  envOverrides: Record<string, string> = {},
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestApp> {
  const saved = Object.fromEntries(Object.keys(envOverrides).map((k) => [k, process.env[k]]));
  Object.assign(process.env, envOverrides);
  const restoreEnv = (): void => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  try {
    let builder = Test.createTestingModule({ imports: [AppModule], controllers: [ProbeController] });
    if (configure) builder = configure(builder);
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication();
    configureApp(app, app.get(AppConfig).env);
    await app.init();

    return {
      app,
      prisma: app.get(PrismaService),
      http: () => request(app.getHttpServer()),
      close: async () => {
        await app.close();
        restoreEnv();
      },
    };
  } catch (error) {
    restoreEnv();
    throw error;
  }
}

/** A different client address for every call, so the login rate limit only applies where a test wants it to. */
let nextHost = 1;
export const freshIp = (): string => {
  const n = nextHost++;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
};

let dataTables: Promise<string[]> | undefined;

/**
 * Empties every table except the lookup data (company, services) and puts that data back: the company, a few
 * services and the counters. Rows are deleted with foreign-key checks switched off for the transaction, which is far
 * quicker than TRUNCATE ... CASCADE on this database, and needs no table list to maintain as modules are added.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  dataTables ??= prisma
    .$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'Company', 'Service')`
    .then((rows) => rows.map((r) => r.tablename));
  const tables = await dataTables;
  await prisma.$transaction([
    prisma.$executeRawUnsafe("SET LOCAL session_replication_role = replica"),
    ...tables.map((table) => prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)),
  ]);
  await prisma.company.upsert({ where: { id: 1 }, update: { name: "Innovexify", casePrefix: "CASE" }, create: { id: 1, name: "Innovexify", casePrefix: "CASE" } });
  const service = (id: string, name: string, active: boolean) => ({ id, name, category: "Formation", description: `${name} (test)`, requirements: [], stages: [], active });
  for (const s of [service("llc", "LLC formation", true), service("corp", "Corporation formation", true), service("address", "Business address", false)]) {
    await prisma.service.upsert({ where: { id: s.id }, update: { active: s.active }, create: s });
  }
  for (const [key, value] of [["case", 100], ["client", 40], ["ticket", 1000], ["report", 200], ["filing", 0]] as const) {
    await prisma.counter.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
}

interface NewUser {
  email: string;
  name?: string;
  role: Role;
  status?: UserStatus;
  csrId?: string;
  password?: boolean;
}

export async function makeUser(prisma: PrismaService, input: NewUser) {
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name ?? input.email.split("@")[0],
      role: input.role,
      status: input.status ?? "ACTIVE",
      passwordHash: input.password === false ? null : await hashOnce(),
    },
  });
  if (input.role === "CLIENT") {
    await prisma.clientProfile.create({
      data: { userId: user.id, caseNumber: `CASE-T-${user.id.slice(-8)}`, csrId: input.csrId ?? null },
    });
  }
  return user;
}

export interface Cookie {
  value: string;
  raw: string;
}

/** The refresh cookie from a response, with its raw Set-Cookie line for checking flags. */
export function refreshCookie(res: request.Response): Cookie | undefined {
  const lines = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const raw = lines.find((l) => l.startsWith("refresh_token="));
  if (!raw) return undefined;
  return { raw, value: raw.split(";")[0].slice("refresh_token=".length) };
}

export async function login(t: TestApp, email: string, password = PASSWORD) {
  const res = await t.http().post("/api/v1/auth/login").set("X-Forwarded-For", freshIp()).send({ email, password });
  return { res, cookie: refreshCookie(res), accessToken: res.body?.data?.accessToken as string | undefined };
}

export const withCookie = (cookie: Cookie | string): string => `refresh_token=${typeof cookie === "string" ? cookie : cookie.value}`;

export const bearer = (token: string | undefined): string => `Bearer ${token ?? ""}`;

/** Signs in and returns a ready-to-use Authorization header value. */
export async function authHeader(t: TestApp, email: string): Promise<string> {
  const { accessToken } = await login(t, email);
  return bearer(accessToken);
}

interface NewCase {
  clientId: string;
  serviceId?: string;
  stage?: CaseStage;
  status?: CaseStatus;
  priority?: Priority;
  ownerId?: string | null;
  filingConfirmation?: string;
  deadline?: Date | null;
}

let nextCaseNumber = 5000;
/** A case straight in the database, at any stage, for tests that start mid-workflow. */
export async function makeCase(prisma: PrismaService, input: NewCase) {
  return prisma.case.create({
    data: {
      number: nextCaseNumber++,
      clientId: input.clientId,
      serviceId: input.serviceId ?? "llc",
      stage: input.stage ?? "INVITATION_SENT",
      status: input.status ?? "AWAITING_CLIENT",
      priority: input.priority ?? "NORMAL",
      ownerId: input.ownerId ?? null,
      filingConfirmation: input.filingConfirmation ?? "",
      deadline: input.deadline === undefined ? new Date("2027-01-31T00:00:00.000Z") : input.deadline,
    },
  });
}

/** Stands in for MailService: remembers every email, and can be told to fail. */
export class RecordingMail extends MailService {
  sent: MailMessage[] = [];
  failWith: Error | null = null;

  send(message: MailMessage): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The invitation link's token from the most recent invitation email sent to an address. */
  inviteTokenFor(email: string): string {
    const mail = [...this.sent].reverse().find((m) => m.kind === "invitation" && m.to === email);
    const token = mail ? /\/invite\/([\w-]+)/.exec(mail.text)?.[1] : undefined;
    if (!token) throw new Error(`No invitation email was sent to ${email}.`);
    return token;
  }
}

/** Boots the app with a RecordingMail in place of the real mail service. */
export async function createAppWithMail(envOverrides: Record<string, string> = {}): Promise<TestApp & { mail: RecordingMail }> {
  const mail = new RecordingMail();
  const t = await createApp(envOverrides, (builder) => builder.overrideProvider(MailService).useValue(mail));
  return Object.assign(t, { mail });
}

/**
 * An access token for a user, signed directly. It is a real token (the guard verifies it and loads the user from the
 * database), but skips the Argon2 verification that a sign-in costs, so tests that aren't about signing in stay fast.
 */
export function bearerFor(t: TestApp, user: { id: string; role: Role }): string {
  const { token } = t.app.get(TokenService).signAccessToken(user, `test-family-${user.id}`);
  return bearer(token);
}

type Req = ReturnType<ReturnType<TestApp["http"]>["get"]>;

/** A request helper that adds the Authorization header and a fresh client address (so the rate limit never interferes). */
export function api(t: TestApp, authorization?: string) {
  const wrap = (req: Req): Req => {
    req.set("X-Forwarded-For", freshIp());
    if (authorization) req.set("Authorization", authorization);
    return req;
  };
  return {
    get: (url: string) => wrap(t.http().get(url)),
    post: (url: string) => wrap(t.http().post(url)),
    patch: (url: string) => wrap(t.http().patch(url)),
    delete: (url: string) => wrap(t.http().delete(url)),
  };
}
