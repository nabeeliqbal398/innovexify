import type { Role } from "@prisma/client";

import { ACCESS_MATRIX, auditCategoryOf, can, PERMS, REASON, type Permission, type PermissionActor } from "./permissions";

const ROLES: Role[] = ["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"];

const actor = (role: Role, id = `${role.toLowerCase()}-1`, status = "ACTIVE"): PermissionActor => ({ id, role, status });

/**
 * The expected access matrix, written out by hand from the product rules (not derived from PERMS),
 * so a change to the table shows up as a failing test. Order matches ACCESS_MATRIX.
 */
const EXPECTED: ReadonlyArray<readonly [label: string, permission: Permission, allowed: Role[]]> = [
  ["Invite Managers", "inviteMANAGER", ["ADMIN"]],
  ["Invite CSRs", "inviteCSR", ["ADMIN", "MANAGER"]],
  ["Invite Compliance", "inviteCOMPLIANCE", ["ADMIN", "MANAGER"]],
  ["Invite clients", "inviteCLIENT", ["ADMIN", "MANAGER", "CSR"]],
  ["Update users' email", "updateEmail", ["ADMIN", "MANAGER"]],
  ["Remove users from the portal", "removeUser", ["ADMIN"]],
  ["Change company name and logo", "branding", ["ADMIN"]],
  ["Assign a new client to a CSR", "assignNewClient", ["ADMIN", "MANAGER", "CSR"]],
  ["Reassign an existing client", "reassignClient", ["ADMIN", "MANAGER"]],
  ["Open client documents", "docsAccess", ["ADMIN", "MANAGER", "COMPLIANCE", "CLIENT"]],
  ["Upload or request documents", "docsManage", ["ADMIN", "MANAGER", "COMPLIANCE"]],
  ["Client team conversations", "conversation", ["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"]],
  ["Send reports to Compliance", "reportSend", ["CSR"]],
  ["Review CSR reports", "reportReview", ["COMPLIANCE"]],
  ["Publish announcements", "announce", ["ADMIN", "MANAGER", "COMPLIANCE"]],
  ["Create projects, move any stage", "manageProjects", ["ADMIN", "MANAGER"]],
  ["Handle tickets (staff)", "ticketsStaff", ["ADMIN", "MANAGER", "CSR", "COMPLIANCE"]],
  ["Company-wide settings", "companySettings", ["ADMIN"]],
];

describe("access matrix", () => {
  it("has the 18 rows, in display order, with the same labels and permissions", () => {
    expect(EXPECTED).toHaveLength(18);
    expect(ACCESS_MATRIX.map(([label, permission]) => [label, permission])).toEqual(EXPECTED.map(([label, permission]) => [label, permission]));
  });

  describe.each(EXPECTED)("%s (%s)", (_label, permission, allowed) => {
    it.each(ROLES)("%s", (role) => {
      expect(can(actor(role), permission)).toBe(allowed.includes(role));
    });
  });

  it("grants nothing to an account that is not active", () => {
    for (const status of ["INVITED", "SUSPENDED", "REMOVED"]) {
      for (const [, permission] of ACCESS_MATRIX) expect(can(actor("ADMIN", "admin-1", status), permission)).toBe(false);
    }
  });

  it("grants nothing without a user", () => {
    expect(can(undefined, "viewClients")).toBe(false);
  });

  it("explains every permission with a reason", () => {
    for (const permission of Object.keys(PERMS) as Permission[]) {
      expect(REASON[permission]).toEqual(expect.any(String));
      expect(REASON[permission].length).toBeGreaterThan(10);
    }
    expect(REASON.default).toBe("Your role doesn't allow this action.");
  });

  it("keeps the reason text the frontend shows", () => {
    expect(REASON.removeUser).toBe(
      "Only Admin can remove users from the portal. Admin and Manager can suspend an account instead, which keeps every record.",
    );
    expect(REASON.docsAccess).toContain("CSRs can't open, preview, download or upload client documents");
  });
});

describe("ownership: a CSR sees only their assigned clients", () => {
  const csr = actor("CSR", "csr-1");
  const mine = { id: "client-a", csr: "csr-1" };
  const theirs = { id: "client-b", csr: "csr-2" };
  const unassigned = { id: "client-c", csr: null };

  it.each(["viewClient", "conversation"] as const)("%s: own client yes, another CSR's client no, unassigned yes", (permission) => {
    expect(can(csr, permission, mine)).toBe(true);
    expect(can(csr, permission, theirs)).toBe(false);
    expect(can(csr, permission, unassigned)).toBe(true);
  });

  it.each(["followups", "caseNotes", "followUpTask", "reportView", "reportSend"] as const)("%s only for their own clients", (permission) => {
    expect(can(csr, permission, { csr: "csr-1" })).toBe(true);
    expect(can(csr, permission, { csr: "csr-2" })).toBe(false);
  });

  it("tickets: own client's yes, another CSR's no, unassigned yes", () => {
    expect(can(csr, "ticketsStaff", { client: "client-a", csrOf: "csr-1" })).toBe(true);
    expect(can(csr, "ticketsStaff", { client: "client-b", csrOf: "csr-2" })).toBe(false);
    expect(can(csr, "ticketsStaff", { client: "client-c", csrOf: null })).toBe(true);
  });

  it("Admin, Manager and Compliance are not limited to assigned clients", () => {
    for (const role of ["ADMIN", "MANAGER", "COMPLIANCE"] as Role[]) {
      expect(can(actor(role), "viewClient", theirs)).toBe(true);
      expect(can(actor(role), "conversation", theirs)).toBe(true);
    }
  });

  it("a CSR can only assign a client who has no CSR yet", () => {
    expect(can(csr, "assignNewClient", { csr: null })).toBe(true);
    expect(can(csr, "assignNewClient", { csr: "csr-2" })).toBe(false);
    expect(can(actor("ADMIN"), "assignNewClient", { csr: "csr-2" })).toBe(false);
  });
});

describe("ownership: a CLIENT sees only their own records", () => {
  const client = actor("CLIENT", "client-a");

  it("their own profile and conversation yes, someone else's no", () => {
    for (const permission of ["viewClient", "conversation"] as const) {
      expect(can(client, permission, { id: "client-a" })).toBe(true);
      expect(can(client, permission, { id: "client-b" })).toBe(false);
    }
  });

  it("their own documents yes, someone else's no", () => {
    expect(can(client, "docsAccess", { client: "client-a" })).toBe(true);
    expect(can(client, "docsAccess", { client: "client-b" })).toBe(false);
  });

  it("their own tickets yes, someone else's no", () => {
    expect(can(client, "ticketOwn", { client: "client-a" })).toBe(true);
    expect(can(client, "ticketOwn", { client: "client-b" })).toBe(false);
  });

  it("no staff-only capability, even on their own records", () => {
    for (const permission of ["viewClients", "docsManage", "docsReview", "ticketsStaff", "reportView", "followups", "caseNotes"] as Permission[]) {
      expect(can(client, permission, { id: "client-a", client: "client-a", csr: "client-a" })).toBe(false);
    }
  });
});

describe("protected accounts", () => {
  const admin = { id: "admin-1", role: "ADMIN" as Role };
  const otherManager = { id: "manager-2", role: "MANAGER" as Role };
  const csr = { id: "csr-1", role: "CSR" as Role };

  it("a Manager can't change or suspend an Admin or another Manager, but can for a CSR", () => {
    const manager = actor("MANAGER", "manager-1");
    for (const permission of ["updateEmail", "suspendUser"] as const) {
      expect(can(manager, permission, admin)).toBe(false);
      expect(can(manager, permission, otherManager)).toBe(false);
      expect(can(manager, permission, csr)).toBe(true);
    }
  });

  it("a Manager can update their own email", () => {
    expect(can(actor("MANAGER", "manager-1"), "updateEmail", { id: "manager-1", role: "MANAGER" })).toBe(true);
  });

  it("nobody can suspend or remove themselves", () => {
    expect(can(actor("ADMIN", "admin-1"), "suspendUser", { id: "admin-1", role: "ADMIN" })).toBe(false);
    expect(can(actor("ADMIN", "admin-1"), "removeUser", { id: "admin-1", role: "ADMIN" })).toBe(false);
    expect(can(actor("ADMIN", "admin-1"), "removeUser", csr)).toBe(true);
  });
});

describe("case stages", () => {
  const compliance = actor("COMPLIANCE");

  it("Compliance can move only the document stages", () => {
    for (const target of ["DOCUMENTS_PENDING", "DOCUMENTS_UNDER_REVIEW", "READY_FOR_FILING"]) {
      expect(can(compliance, "complianceMilestones", { target })).toBe(true);
    }
    for (const target of ["STATE_FILING_IN_PROGRESS", "COMPLETED", "INVITATION_SENT"]) {
      expect(can(compliance, "complianceMilestones", { target })).toBe(false);
    }
  });

  it("Admin and Manager can move any stage; a CSR can't move one", () => {
    expect(can(actor("ADMIN"), "complianceMilestones", { target: "COMPLETED" })).toBe(true);
    expect(can(actor("MANAGER"), "complianceMilestones", { target: "COMPLETED" })).toBe(true);
    expect(can(actor("CSR"), "complianceMilestones", { target: "DOCUMENTS_PENDING" })).toBe(false);
  });
});

describe("audit categories", () => {
  it.each([
    ["removeUser", "users"],
    ["inviteCSR", "users"],
    ["docsAccess", "docs"],
    ["ticketsStaff", "tickets"],
    ["editCase", "cases"],
    ["reportReview", "reports"],
    ["branding", "settings"],
    ["help", "other"],
  ] as const)("%s -> %s", (permission, category) => {
    expect(auditCategoryOf(permission)).toBe(category);
  });
});

describe("case stage permissions", () => {
  const compliance = actor("COMPLIANCE");

  it("lets Compliance move a case only between document stages: where it is and where it goes", () => {
    expect(can(compliance, "complianceMilestones", { current: "DOCUMENTS_PENDING", target: "DOCUMENTS_UNDER_REVIEW" })).toBe(true);
    expect(can(compliance, "complianceMilestones", { current: "DOCUMENTS_UNDER_REVIEW", target: "READY_FOR_FILING" })).toBe(true);
    expect(can(compliance, "complianceMilestones", { current: "READY_FOR_FILING", target: "STATE_FILING_IN_PROGRESS" })).toBe(false);
    expect(can(compliance, "complianceMilestones", { current: "INFORMATION_REQUIRED", target: "DOCUMENTS_PENDING" })).toBe(false);
  });

  it("does not limit Admin and Manager by stage", () => {
    for (const role of ["ADMIN", "MANAGER"] as Role[]) {
      expect(can(actor(role), "complianceMilestones", { current: "EIN_PROCESSING", target: "POST_FORMATION_DOCUMENTS" })).toBe(true);
    }
  });

  it("allows an explicit rollback to Admin and Manager only", () => {
    expect(ROLES.filter((role) => can(actor(role), "rollbackStage"))).toEqual(["ADMIN", "MANAGER"]);
  });
});
