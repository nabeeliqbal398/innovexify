import { Prisma } from "@prisma/client";

import { caseScope, clientScope, taskScope, type ScopeActor } from "../src/common/scope/scope";
import { caseInScope, clientIdInScope, taskInScope } from "../src/common/scope/scope-sql";
import { createAppWithMail, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

/**
 * The aggregate queries (dashboard, analytics, search, unread counts) scope with SQL fragments; list and detail endpoints scope
 * with Prisma `where` objects. Both must pick exactly the same rows for every role, so this compares them on one fixture.
 */
describe("scope SQL matches the Prisma scopes (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };
  const actors: Record<string, ScopeActor> = {};

  beforeAll(async () => {
    t = await createAppWithMail();
    await resetDatabase(t.prisma);
    const ada = await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
    const max = await makeUser(t.prisma, { email: "manager@test.dev", role: "MANAGER" });
    const sam = await makeUser(t.prisma, { email: "csr@test.dev", role: "CSR" });
    const carl = await makeUser(t.prisma, { email: "csr2@test.dev", role: "CSR" });
    const cleo = await makeUser(t.prisma, { email: "comp@test.dev", role: "COMPLIANCE" });
    const cora = await makeUser(t.prisma, { email: "comp2@test.dev", role: "COMPLIANCE" });
    const alex = await makeUser(t.prisma, { email: "c1@test.dev", role: "CLIENT", csrId: sam.id });
    const bea = await makeUser(t.prisma, { email: "c2@test.dev", role: "CLIENT", csrId: carl.id });
    const cal = await makeUser(t.prisma, { email: "c3@test.dev", role: "CLIENT" });
    const gone = await makeUser(t.prisma, { email: "c4@test.dev", role: "CLIENT", csrId: sam.id });
    await t.prisma.user.update({ where: { id: gone.id }, data: { deletedAt: new Date(), status: "REMOVED" } });
    Object.assign(actors, {
      admin: { id: ada.id, role: "ADMIN" },
      manager: { id: max.id, role: "MANAGER" },
      sam: { id: sam.id, role: "CSR" },
      carl: { id: carl.id, role: "CSR" },
      cleo: { id: cleo.id, role: "COMPLIANCE" },
      cora: { id: cora.id, role: "COMPLIANCE" },
      alex: { id: alex.id, role: "CLIENT" },
      bea: { id: bea.id, role: "CLIENT" },
      cal: { id: cal.id, role: "CLIENT" },
      gone: { id: gone.id, role: "CLIENT" },
    });
    let n = 0;
    for (const client of [alex, bea, cal, gone]) {
      const kase = await t.prisma.case.create({ data: { number: 700 + ++n, clientId: client.id, serviceId: "llc", ownerId: client.id === alex.id ? cleo.id : null } });
      const task = (data: Record<string, unknown>) =>
        t.prisma.task.create({ data: { caseId: kase.id, title: "t", type: "OPERATIONS", createdById: ada.id, assigneeId: ada.id, due: new Date("2099-01-01"), ...data } as never });
      await task({});
      await task({ visibility: "CLIENT" });
      await task({ assigneeId: cleo.id });
      await task({ createdById: cora.id });
    }
    // A soft-deleted case.
    await t.prisma.case.create({ data: { number: 790, clientId: alex.id, serviceId: "llc", deletedAt: new Date() } });
  });
  afterAll(async () => {
    await t.close();
  });

  const ids = (rows: Array<{ id: string }>): string[] => rows.map((r) => r.id).sort();

  it.each(["admin", "manager", "sam", "carl", "cleo", "cora", "alex", "bea", "cal", "gone"])("clients: %s", async (name) => {
    const actor = actors[name] as ScopeActor;
    const viaPrisma = await t.prisma.user.findMany({ where: { AND: [{ role: "CLIENT" }, clientScope(actor)] }, select: { id: true } });
    const viaSql = await t.prisma.$queryRaw<Array<{ id: string }>>`SELECT u.id FROM "User" u WHERE u.role = 'CLIENT'::"Role" AND ${clientIdInScope(actor, Prisma.sql`u.id`)}`;
    expect(ids(viaSql)).toEqual(ids(viaPrisma));
  });

  it.each(["admin", "manager", "sam", "carl", "cleo", "cora", "alex", "bea", "cal", "gone"])("cases: %s", async (name) => {
    const actor = actors[name] as ScopeActor;
    const viaPrisma = await t.prisma.case.findMany({ where: caseScope(actor), select: { id: true } });
    const viaSql = await t.prisma.$queryRaw<Array<{ id: string }>>`SELECT c.id FROM "Case" c WHERE ${caseInScope(actor, "c")}`;
    expect(ids(viaSql)).toEqual(ids(viaPrisma));
  });

  it.each(["admin", "manager", "sam", "carl", "cleo", "cora", "alex", "bea", "cal", "gone"])("tasks: %s", async (name) => {
    const actor = actors[name] as ScopeActor;
    const viaPrisma = await t.prisma.task.findMany({ where: taskScope(actor), select: { id: true } });
    const viaSql = await t.prisma.$queryRaw<Array<{ id: string }>>`SELECT k.id FROM "Task" k JOIN "Case" c ON c.id = k."caseId" WHERE ${taskInScope(actor, "k", "c")}`;
    expect(ids(viaSql)).toEqual(ids(viaPrisma));
  });

  it("the fixture is not trivially the same for everyone", async () => {
    const count = async (name: string): Promise<number> => (await t.prisma.case.count({ where: caseScope(actors[name] as ScopeActor) }));
    expect(await count("admin")).toBe(4); // four live cases (the fifth is soft-deleted)
    expect(await count("sam")).toBe(2); // Alex's and the removed client's, both assigned to Sam
    expect(await count("alex")).toBe(1);
    expect(await count("gone")).toBe(1);
  });
});
