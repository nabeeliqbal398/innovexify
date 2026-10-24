import { bootstrapCatalog } from "../src/cli/bootstrap-catalog";
import { DEFAULT_SERVICES } from "../src/cli/service-catalog";
import { createApp, makeUser, resetDatabase, type TestApp } from "./helpers";

describe("bootstrap the service catalog (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.prisma.service.deleteMany(); // a fresh production database has no services (resetDatabase puts three test ones back)
  });

  it("adds every default service to an empty catalog and nothing else", async () => {
    const out = await bootstrapCatalog(t.prisma);
    expect(out.created.sort()).toEqual(DEFAULT_SERVICES.map((s) => s.id).sort());
    expect(await t.prisma.service.count()).toBe(DEFAULT_SERVICES.length);
    expect(DEFAULT_SERVICES.map((s) => s.id)).toEqual(expect.arrayContaining(["llc", "corp", "ra", "ein"])); // the id clients default to is there
    for (const model of ["user", "case", "task", "document", "message", "ticket", "auditLog"] as const) {
      expect({ model, rows: await (t.prisma[model] as unknown as { count: () => Promise<number> }).count() }).toEqual({ model, rows: 0 });
    }
  });

  it("matches the seed: the seed uses the very same list", async () => {
    await bootstrapCatalog(t.prisma);
    const stored = await t.prisma.service.findMany({ orderBy: { id: "asc" } });
    expect(stored.map(({ id, name, category, description, requirements, stages, active }) => ({ id, name, category, description, requirements, stages, active }))).toEqual(
      [...DEFAULT_SERVICES].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it("is idempotent: a second run changes nothing", async () => {
    await bootstrapCatalog(t.prisma);
    const before = await t.prisma.service.findMany({ orderBy: { id: "asc" } });
    const again = await bootstrapCatalog(t.prisma);
    expect(again).toEqual({ created: [], unchanged: DEFAULT_SERVICES.map((s) => s.id), edited: [] });
    expect(await t.prisma.service.findMany({ orderBy: { id: "asc" } })).toEqual(before); // not even updatedAt moved
  });

  it("refuses to overwrite a service someone edited, and still adds what is missing", async () => {
    await bootstrapCatalog(t.prisma);
    await t.prisma.service.update({ where: { id: "llc" }, data: { name: "LLC (our wording)", fee: "$299" } });
    await t.prisma.service.update({ where: { id: "ein" }, data: { active: false } });
    await t.prisma.service.delete({ where: { id: "oa" } });
    const out = await bootstrapCatalog(t.prisma);
    expect(out.edited.sort()).toEqual(["ein", "llc"]);
    expect(out.created).toEqual(["oa"]);
    const llc = await t.prisma.service.findUniqueOrThrow({ where: { id: "llc" } });
    expect({ name: llc.name, fee: llc.fee }).toEqual({ name: "LLC (our wording)", fee: "$299" });
    expect((await t.prisma.service.findUniqueOrThrow({ where: { id: "ein" } })).active).toBe(false);
  });

  it("leaves a service with cases attached alone and does not touch other data", async () => {
    await bootstrapCatalog(t.prisma);
    const client = await makeUser(t.prisma, { email: "c@test.dev", role: "CLIENT" });
    await t.prisma.case.create({ data: { number: 1, clientId: client.id, serviceId: "llc", stage: "INVITATION_SENT", status: "AWAITING_CLIENT", priority: "NORMAL" } });
    await bootstrapCatalog(t.prisma);
    expect(await t.prisma.case.count()).toBe(1);
    expect(await t.prisma.user.count()).toBe(1);
  });

  it("two runs at the same time do not clash", async () => {
    const [a, b] = await Promise.all([bootstrapCatalog(t.prisma), bootstrapCatalog(t.prisma)]);
    expect(await t.prisma.service.count()).toBe(DEFAULT_SERVICES.length);
    expect(a.created.length + b.created.length).toBeGreaterThanOrEqual(DEFAULT_SERVICES.length);
  });
});
