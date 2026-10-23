import * as argon2 from "argon2";

import { createFirstAdmin } from "../src/cli/create-admin";
import { createAppWithMail, login, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

describe("create the first admin (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };
  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const input = { email: "Owner@Example.com", name: "Olive Owner", password: "Correct-Horse-9Battery" };

  it("creates an Admin who can sign in, and audits it", async () => {
    const admin = await createFirstAdmin(t.prisma, input);
    expect(admin).toMatchObject({ email: "owner@example.com", role: "ADMIN", status: "ACTIVE" });
    expect(await argon2.verify(admin.passwordHash as string, input.password)).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { actorId: admin.id, action: "Created the first Admin account" } })).toBe(1);
    const session = await login(t, "owner@example.com", input.password);
    expect(session.res.status).toBe(200);
    expect(session.accessToken).toBeTruthy();
  });

  it("refuses a weak password, a bad email and a missing name", async () => {
    await expect(createFirstAdmin(t.prisma, { ...input, password: "short" })).rejects.toThrow(/ADMIN_PASSWORD/);
    await expect(createFirstAdmin(t.prisma, { ...input, email: "nope" })).rejects.toThrow(/ADMIN_EMAIL/);
    await expect(createFirstAdmin(t.prisma, { ...input, name: "  " })).rejects.toThrow(/ADMIN_NAME/);
    expect(await t.prisma.user.count()).toBe(0);
  });

  it("refuses when an Admin already exists", async () => {
    await makeUser(t.prisma, { email: "existing@test.dev", role: "ADMIN" });
    await expect(createFirstAdmin(t.prisma, input)).rejects.toThrow(/already exists/);
    expect(await t.prisma.user.count()).toBe(1);
  });
});
