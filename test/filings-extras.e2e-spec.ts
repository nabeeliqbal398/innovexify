import { api, bearerFor, createAppWithMail, makeCase, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

describe("filing list shows the client's formation state (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });

  it("includes it on each filing, empty when none is chosen", async () => {
    await resetDatabase(t.prisma);
    const cleo = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    const alex = await makeUser(t.prisma, { email: "a@test.dev", name: "Alex Client", role: "CLIENT" });
    const bea = await makeUser(t.prisma, { email: "b@test.dev", name: "Bea Client", role: "CLIENT" });
    await t.prisma.clientProfile.update({ where: { userId: alex.id }, data: { formationState: "Wyoming" } });
    const a = await makeCase(t.prisma, { clientId: alex.id });
    const b = await makeCase(t.prisma, { clientId: bea.id });
    await t.prisma.filing.create({ data: { number: 1, caseId: a.id, type: "Articles" } });
    await t.prisma.filing.create({ data: { number: 2, caseId: b.id, type: "Articles" } });
    const res = await api(t, bearerFor(t, cleo)).get("/api/v1/filings?sort=number&order=asc");
    expect(res.body.data.map((f: { case: { client: { formationState: string } } }) => f.case.client.formationState)).toEqual(["Wyoming", ""]);
  });
});
