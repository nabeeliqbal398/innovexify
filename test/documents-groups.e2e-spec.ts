import { api, bearerFor, createAppWithMail, makeDocument, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;

describe("document list groups (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });

  let cleo: User;
  let client: User;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    cleo = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    client = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT" });
    for (const [name, status] of [
      ["Requested one", "REQUESTED"],
      ["Submitted one", "SUBMITTED"],
      ["Approved one", "APPROVED"],
      ["Rejected one", "REJECTED"],
      ["Info one", "INFO"],
      ["Shared one", "SHARED"],
    ] as const) {
      await makeDocument(t.prisma, { clientId: client.id, name, status });
    }
  });

  const names = async (query: string): Promise<string[]> =>
    ((await api(t, bearerFor(t, cleo)).get(`/api/v1/documents?${query}&sort=name&order=asc`)).body.data as Array<{ name: string }>).map((d) => d.name);

  it("group=submissions leaves out what is still requested or was shared by staff", async () => {
    expect(await names("group=submissions")).toEqual(["Approved one", "Info one", "Rejected one", "Submitted one"]);
  });

  it("group=outstanding is what waits on the client", async () => {
    expect(await names("group=outstanding")).toEqual(["Rejected one", "Requested one"]);
  });

  it("only narrows a status filter, and bad values are refused with a message on the field", async () => {
    expect(await names("group=submissions&status=REQUESTED")).toEqual([]);
    expect(await names("group=outstanding&status=REJECTED")).toEqual(["Rejected one"]);
    const bad = await api(t, bearerFor(t, cleo)).get("/api/v1/documents?group=everything");
    expect(bad.status).toBe(422);
    expect(bad.body.errors[0].field).toBe("group");
  });
});
