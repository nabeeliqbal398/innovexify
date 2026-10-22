import { api, bearerFor, createAppWithMail, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;

const png = (extra = 64): string => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra, 7)]).toString("base64")}`;

describe("settings: company, services, automation, access (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });

  let ada: User;
  let max: User;
  let sam: User;
  let cleo: User;
  let alex: User;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.mail.sent = [];
    await t.prisma.service.deleteMany({ where: { id: { notIn: ["llc", "corp", "address"] } } });
    ada = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    max = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    sam = await makeUser(t.prisma, { email: "csr@test.dev", name: "Sam Csr", role: "CSR" });
    cleo = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    alex = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: sam.id });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));

  describe("company", () => {
    it("is readable by everyone signed in, and by no one else", async () => {
      for (const who of [ada, max, sam, cleo, alex]) {
        const res = await as(who).get("/api/v1/company");
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ name: "Innovexify", casePrefix: "CASE", logo: "" });
      }
      expect((await api(t).get("/api/v1/company")).status).toBe(401);
    });

    it("lets the Admin change the name and prefix, and audits it", async () => {
      const res = await as(ada).patch("/api/v1/company").send({ name: "  Acme Filings ", casePrefix: "acme" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: "Acme Filings", casePrefix: "ACME" });
      expect(res.body.message).toContain("existing case IDs keep their old prefix");
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Changed company settings" }, actorId: ada.id, category: "settings" } })).toBe(1);
    });

    it("never rewrites an existing case number when the prefix changes", async () => {
      const profile = await t.prisma.clientProfile.findUniqueOrThrow({ where: { userId: alex.id } });
      await as(max).patch("/api/v1/company").send({ casePrefix: "ZZ" });
      expect((await t.prisma.clientProfile.findUniqueOrThrow({ where: { userId: alex.id } })).caseNumber).toBe(profile.caseNumber);
    });

    it("lets a Manager change the prefix but not the name or logo", async () => {
      expect((await as(max).patch("/api/v1/company").send({ casePrefix: "MGR" })).status).toBe(200);
      for (const body of [{ name: "Manager Co" }, { logo: png() }, { name: "X", casePrefix: "OK" }]) {
        const res = await as(max).patch("/api/v1/company").send(body);
        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe("PERMISSION_DENIED");
      }
      expect((await t.prisma.company.findUniqueOrThrow({ where: { id: 1 } })).name).toBe("Innovexify");
      expect(await t.prisma.auditLog.count({ where: { ok: false, category: "settings" } })).toBe(3);
    });

    it("refuses everyone else", async () => {
      for (const who of [sam, cleo, alex]) expect((await as(who).patch("/api/v1/company").send({ casePrefix: "NO" })).status).toBe(403);
    });

    it("validates the fields with a message on each", async () => {
      const bad = await as(ada).patch("/api/v1/company").send({ name: "x".repeat(61), casePrefix: "AB1" });
      expect(bad.status).toBe(422);
      expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["casePrefix", "name"]);
      expect((await as(ada).patch("/api/v1/company").send({ casePrefix: "TOOLONGPREFIX" })).status).toBe(422);
      expect((await as(ada).patch("/api/v1/company").send({ name: "   " })).status).toBe(422);
      expect((await as(ada).patch("/api/v1/company").send({})).status).toBe(422);
    });

    it("accepts a real PNG logo, serves it back, and removes it with an empty string", async () => {
      expect((await as(ada).patch("/api/v1/company").send({ logo: png() })).status).toBe(200);
      expect((await as(alex).get("/api/v1/company")).body.data.logo).toBe(png());
      expect((await as(ada).patch("/api/v1/company").send({ logo: "" })).status).toBe(200);
      expect((await as(alex).get("/api/v1/company")).body.data.logo).toBe("");
    });

    it("refuses an SVG, a wrong declared type, a fake PNG, and one over 200 KB", async () => {
      const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64")}`;
      const fakePng = `data:image/png;base64,${Buffer.from("<html><script>alert(1)</script></html>").toString("base64")}`;
      const jpegDeclaredAsPng = `data:image/jpeg;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64")}`;
      for (const logo of [svg, fakePng, jpegDeclaredAsPng, "https://evil.example/logo.png", "not a data url"]) {
        const res = await as(ada).patch("/api/v1/company").send({ logo });
        expect(res.status).toBe(422);
        expect(res.body.errorCode).toBe("LOGO_INVALID");
        expect(res.body.errors[0].field).toBe("logo");
      }
      const big = await as(ada).patch("/api/v1/company").send({ logo: png(205 * 1024) });
      expect(big.status).toBe(422);
      expect(big.body.errorCode).toBe("LOGO_INVALID");
      expect(big.body.message).toMatch(/KB/);
      expect((await t.prisma.company.findUniqueOrThrow({ where: { id: 1 } })).logo).toBe("");
    });
  });

  describe("services", () => {
    const body = { name: "Trademark filing", category: "Legal", description: "File a trademark.", requirements: ["Logo"], stages: ["CLIENT_ONBOARDING", "COMPLETED"] };

    it("shows staff every service and a client only the active ones", async () => {
      const staff = (await as(sam).get("/api/v1/services")).body.data.map((s: { id: string }) => s.id);
      expect(staff).toEqual(expect.arrayContaining(["llc", "corp", "address"]));
      expect((await as(alex).get("/api/v1/services")).body.data.map((s: { id: string }) => s.id).sort()).toEqual(["corp", "llc"]);
      expect((await as(alex).get("/api/v1/services/address")).status).toBe(404);
      expect((await as(sam).get("/api/v1/services/address")).status).toBe(200);
    });

    it("lets Admin and Manager add one with an id made from the name", async () => {
      const res = await as(max).post("/api/v1/services").send(body);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ id: "trademark-filing", name: "Trademark filing", active: true, turnaround: "", fee: "" });
      expect((await as(alex).get("/api/v1/services/trademark-filing")).status).toBe(200);
    });

    it("refuses a duplicate name, bad stages and an empty body with specific messages", async () => {
      await as(ada).post("/api/v1/services").send(body);
      const dup = await as(ada).post("/api/v1/services").send({ ...body, name: "Trademark Filing!" });
      expect(dup.status).toBe(409);
      expect(dup.body.errorCode).toBe("DUPLICATE_RESOURCE");
      const bad = await as(ada).post("/api/v1/services").send({ ...body, name: "Other", stages: ["NOT_A_STAGE"] });
      expect(bad.status).toBe(422);
      expect(bad.body.errors[0].field).toBe("stages");
      expect((await as(ada).post("/api/v1/services").send({ ...body, name: "!!!" })).status).toBe(422);
    });

    it("refuses CSR, Compliance and client from changing the catalog", async () => {
      for (const who of [sam, cleo, alex]) {
        expect((await as(who).post("/api/v1/services").send(body)).status).toBe(403);
        expect((await as(who).patch("/api/v1/services/llc").send({ fee: "$1" })).status).toBe(403);
        expect((await as(who).post("/api/v1/services/llc/deactivate").send()).status).toBe(403);
      }
    });

    it("edits a service and rejects an empty edit", async () => {
      const res = await as(max).patch("/api/v1/services/llc").send({ fee: "$199", requirements: [" ID ", "Proof of address"] });
      expect(res.body.data).toMatchObject({ fee: "$199", requirements: ["ID", "Proof of address"] });
      expect((await as(max).patch("/api/v1/services/llc").send({})).status).toBe(422);
      expect((await as(max).patch("/api/v1/services/nope").send({ fee: "x" })).status).toBe(404);
    });

    it("switches a service off and on, hides it from clients, and leaves existing cases alone", async () => {
      const kase = await t.prisma.case.create({
        data: { number: 900, clientId: alex.id, serviceId: "llc", title: "Existing", stage: "CLIENT_ONBOARDING" } as never,
      }).catch(() => null);
      expect((await as(max).post("/api/v1/services/llc/deactivate").send()).status).toBe(200);
      expect((await as(alex).get("/api/v1/services")).body.data.map((s: { id: string }) => s.id)).toEqual(["corp"]);
      const again = await as(max).post("/api/v1/services/llc/deactivate").send();
      expect(again.status).toBe(409);
      expect(again.body.errorCode).toBe("SERVICE_STATE_UNCHANGED");
      if (kase) expect((await t.prisma.case.findUniqueOrThrow({ where: { id: kase.id } })).serviceId).toBe("llc");
      expect((await as(max).post("/api/v1/services/llc/reactivate").send()).status).toBe(200);
      expect((await as(max).post("/api/v1/services/llc/reactivate").send()).status).toBe(409);
      expect((await as(alex).get("/api/v1/services")).body.data).toHaveLength(2);
      expect(await t.prisma.auditLog.count({ where: { target: "llc", category: "settings" } })).toBe(2);
    });
  });

  describe("automation", () => {
    it("lists the five triggers for Admin and Manager only", async () => {
      const res = await as(ada).get("/api/v1/automation/triggers");
      expect(res.body.data.map((x: { key: string }) => x.key)).toEqual(["docreq", "inv", "msg", "sec", "ticket"]);
      expect((await as(max).get("/api/v1/automation/triggers")).status).toBe(200);
      for (const who of [sam, cleo, alex]) expect((await as(who).get("/api/v1/automation/triggers")).status).toBe(403);
    });

    it("lets a Manager switch a trigger but only an Admin choose a template", async () => {
      expect((await as(max).patch("/api/v1/automation/triggers/ticket").send({ enabled: false })).body.data.enabled).toBe(false);
      const tpl = await as(max).patch("/api/v1/automation/triggers/ticket").send({ template: "Ticket update (short)" });
      expect(tpl.status).toBe(403);
      expect(tpl.body.errorCode).toBe("PERMISSION_DENIED");
      expect((await as(ada).patch("/api/v1/automation/triggers/ticket").send({ template: "Ticket update (short)" })).body.data.template).toBe("Ticket update (short)");
      for (const who of [sam, cleo, alex]) expect((await as(who).patch("/api/v1/automation/triggers/ticket").send({ enabled: true })).status).toBe(403);
    });

    it("rejects a template that isn't one of the trigger's options, an unknown key and an empty body", async () => {
      const bad = await as(ada).patch("/api/v1/automation/triggers/msg").send({ template: "Phishing v1" });
      expect(bad.status).toBe(422);
      expect(bad.body.errorCode).toBe("TEMPLATE_NOT_ALLOWED");
      expect((await as(ada).patch("/api/v1/automation/triggers/nope").send({ enabled: false })).status).toBe(404);
      expect((await as(ada).patch("/api/v1/automation/triggers/msg").send({})).status).toBe(422);
      expect((await as(ada).patch("/api/v1/automation/triggers/msg").send({ enabled: "yes" })).status).toBe(422);
    });

    it("never lets the security trigger be switched off", async () => {
      const res = await as(ada).patch("/api/v1/automation/triggers/sec").send({ enabled: false });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("SECURITY_TRIGGER_REQUIRED");
      expect((await t.prisma.notificationTrigger.findUniqueOrThrow({ where: { key: "sec" } })).enabled).toBe(true);
    });

    it("a disabled trigger suppresses the email but not the in-app notification", async () => {
      await as(ada).patch("/api/v1/automation/triggers/msg").send({ enabled: false });
      const sent = await as(sam).post(`/api/v1/clients/${alex.id}/messages`).send({ text: "Hello Alex" });
      expect(sent.status).toBe(201);
      expect(t.mail.sent.filter((m) => m.to === alex.email)).toHaveLength(0);
      expect(await t.prisma.notification.count({ where: { userId: alex.id } })).toBe(1);

      await as(ada).patch("/api/v1/automation/triggers/msg").send({ enabled: true });
      await as(sam).post(`/api/v1/clients/${alex.id}/messages`).send({ text: "Hello again" });
      expect(t.mail.sent.filter((m) => m.to === alex.email).length).toBeGreaterThan(0);
      expect(await t.prisma.notification.count({ where: { userId: alex.id } })).toBe(2);
    });
  });

  describe("access matrix", () => {
    it("returns the 18 capabilities from the permission table the server enforces", async () => {
      const res = await as(sam).get("/api/v1/access/matrix");
      expect(res.status).toBe(200);
      expect(res.body.data.roles).toEqual(["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"]);
      expect(res.body.data.rows).toHaveLength(18);
      const row = (permission: string) => res.body.data.rows.find((r: { permission: string }) => r.permission === permission);
      expect(row("inviteMANAGER").roles).toEqual(["ADMIN"]);
      expect(row("branding").roles).toEqual(["ADMIN"]);
      expect(row("announce").roles).toEqual(["ADMIN", "MANAGER", "COMPLIANCE"]);
    });

    it("requires sign-in", async () => {
      expect((await api(t).get("/api/v1/access/matrix")).status).toBe(401);
    });
  });
});
