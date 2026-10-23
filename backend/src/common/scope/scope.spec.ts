import { caseScope, clientScope, documentScope, followUpScope, reportScope, taskScope, type ScopeActor } from "./scope";

const actor = (role: ScopeActor["role"], id = `${role.toLowerCase()}-1`): ScopeActor => ({ id, role });

describe("data scoping", () => {
  describe("clientScope", () => {
    it("lets Admin, Manager and Compliance see every client, but hides removed ones by default", () => {
      for (const role of ["ADMIN", "MANAGER", "COMPLIANCE"] as const) {
        expect(clientScope(actor(role))).toEqual({ AND: [{ deletedAt: null }, {}] });
      }
    });
    it("limits a CSR to the clients assigned to them", () => {
      expect(clientScope(actor("CSR", "csr-7"))).toEqual({ AND: [{ deletedAt: null }, { clientProfile: { is: { csrId: "csr-7" } } }] });
    });
    it("limits a client to their own record", () => {
      expect(clientScope(actor("CLIENT", "c-9"))).toEqual({ AND: [{ deletedAt: null }, { id: "c-9" }] });
    });
    it("shows removed clients to Admin and Manager when asked, and to nobody else", () => {
      expect(clientScope(actor("ADMIN"), { includeRemoved: true })).toEqual({ AND: [{}, {}] });
      expect(clientScope(actor("MANAGER"), { includeRemoved: true })).toEqual({ AND: [{}, {}] });
      expect(clientScope(actor("CSR", "c1"), { includeRemoved: true }).AND).toContainEqual({ deletedAt: null });
      expect(clientScope(actor("COMPLIANCE"), { includeRemoved: true }).AND).toContainEqual({ deletedAt: null });
    });
  });

  describe("caseScope", () => {
    it("lets Admin, Manager and Compliance see every case", () => {
      for (const role of ["ADMIN", "MANAGER", "COMPLIANCE"] as const) {
        expect(caseScope(actor(role))).toEqual({ AND: [{ deletedAt: null }, {}] });
      }
    });
    it("limits a CSR to the cases of their assigned clients", () => {
      expect(caseScope(actor("CSR", "csr-7"))).toEqual({
        AND: [{ deletedAt: null }, { client: { is: { clientProfile: { is: { csrId: "csr-7" } } } } }],
      });
    });
    it("limits a client to their own cases", () => {
      expect(caseScope(actor("CLIENT", "c-9"))).toEqual({ AND: [{ deletedAt: null }, { clientId: "c-9" }] });
    });
    it("fails closed for a role it does not know", () => {
      const where = caseScope({ id: "x", role: "AUDITOR" as never });
      expect(JSON.stringify(where)).toContain("__scope_matches_nothing__");
    });
  });
});

describe("data scoping, Phase 3", () => {
  const MATCH_NOTHING = "__scope_matches_nothing__";

  describe("taskScope", () => {
    it("limits every role to tasks on cases they can see", () => {
      for (const role of ["ADMIN", "MANAGER", "CSR"] as const) {
        expect(JSON.stringify(taskScope(actor(role, "u1")))).toContain('"case"');
      }
    });
    it("limits a client to tasks marked for them", () => {
      expect(JSON.stringify(taskScope(actor("CLIENT", "c1")))).toContain('"visibility":"CLIENT"');
    });
    it("limits Compliance to tasks assigned to them, created by them, or on a case they own", () => {
      const json = JSON.stringify(taskScope(actor("COMPLIANCE", "k1")));
      expect(json).toContain('"assigneeId":"k1"');
      expect(json).toContain('"createdById":"k1"');
      expect(json).toContain('"ownerId":"k1"');
    });
    it("fails closed for an unknown role", () => {
      expect(JSON.stringify(taskScope({ id: "x", role: "AUDITOR" as never }))).toContain(MATCH_NOTHING);
    });
  });

  describe("documentScope", () => {
    it("hides deleted documents, and those of removed clients, from everyone by default", () => {
      expect(documentScope(actor("COMPLIANCE")).AND).toContainEqual({ deletedAt: null, client: { is: { deletedAt: null } } });
    });
    it("lets Admin and Manager, and nobody else, ask for deleted ones", () => {
      expect(documentScope(actor("ADMIN"), { includeRemoved: true })).toEqual({ AND: [{}, {}] });
      expect(documentScope(actor("MANAGER"), { includeRemoved: true })).toEqual({ AND: [{}, {}] });
      expect(documentScope(actor("COMPLIANCE"), { includeRemoved: true }).AND).toContainEqual({ deletedAt: null, client: { is: { deletedAt: null } } });
      expect(documentScope(actor("CSR", "s1"), { includeRemoved: true }).AND).toContainEqual({ deletedAt: null, client: { is: { deletedAt: null } } });
    });
    it("limits a CSR to their clients' documents and a client to their own", () => {
      expect(JSON.stringify(documentScope(actor("CSR", "s1")))).toContain('"csrId":"s1"');
      expect(JSON.stringify(documentScope(actor("CLIENT", "c1")))).toContain('"clientId":"c1"');
    });
  });

  describe("followUpScope and reportScope", () => {
    it("gives Admin and Manager every follow-up and a CSR only their own; nobody else has any", () => {
      expect(followUpScope(actor("ADMIN"))).toEqual({});
      expect(followUpScope(actor("MANAGER"))).toEqual({});
      expect(followUpScope(actor("CSR", "s1"))).toEqual({ csrId: "s1" });
      for (const role of ["COMPLIANCE", "CLIENT"] as const) expect(JSON.stringify(followUpScope(actor(role)))).toContain(MATCH_NOTHING);
    });
    it("gives Admin, Manager and Compliance every report, a CSR their own, and a client none", () => {
      for (const role of ["ADMIN", "MANAGER", "COMPLIANCE"] as const) expect(reportScope(actor(role))).toEqual({});
      expect(reportScope(actor("CSR", "s1"))).toEqual({ csrId: "s1" });
      expect(JSON.stringify(reportScope(actor("CLIENT")))).toContain(MATCH_NOTHING);
    });
  });
});
