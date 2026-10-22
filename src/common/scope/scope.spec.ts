import { caseScope, clientScope, type ScopeActor } from "./scope";

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
