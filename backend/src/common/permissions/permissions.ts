/**
 * This file imports nothing, on purpose: the web app's tests load it directly (frontend/tests/unit/permissions-parity.test.ts) and run without
 * the backend's packages installed. `role-parity.spec.ts` fails the backend build if this list ever differs from the Role enum in schema.prisma.
 */
export type Role = "ADMIN" | "MANAGER" | "CSR" | "COMPLIANCE" | "CLIENT";

/**
 * Ported from frontend/src/lib/permissions.ts: same permission names, same resource rules, same REASON text.
 * One table decides what a role may do; resource rules (own clients, protected accounts) apply on top.
 */

export type Permission =
  | "inviteMANAGER"
  | "inviteCSR"
  | "inviteCOMPLIANCE"
  | "inviteCLIENT"
  | "updateEmail"
  | "removeUser"
  | "suspendUser"
  | "branding"
  | "companySettings"
  | "operationalSettings"
  | "auditLog"
  | "viewClients"
  | "viewClient"
  | "assignNewClient"
  | "reassignClient"
  | "docsAccess"
  | "docsManage"
  | "docsReview"
  | "deleteDocument"
  | "conversation"
  | "attachStaff"
  | "reportSend"
  | "reportView"
  | "reportReview"
  | "announce"
  | "manageProjects"
  | "rollbackStage"
  | "complianceMilestones"
  | "viewProjects"
  | "followUpTask"
  | "complianceTask"
  | "allTasks"
  | "ticketsStaff"
  | "ticketOwn"
  | "manageTriggers"
  | "manageTemplates"
  | "editCase"
  | "manageServices"
  | "viewServices"
  | "analytics"
  | "followups"
  | "filingTracker"
  | "caseNotes"
  | "caseNotesCompliance"
  | "help"
  | "manageTasks"
  | "reportAck";

const ALL_STAFF: Role[] = ["ADMIN", "MANAGER", "CSR", "COMPLIANCE"];

export const PERMS: Record<Permission, Role[]> = {
  inviteMANAGER: ["ADMIN"],
  inviteCSR: ["ADMIN", "MANAGER"],
  inviteCOMPLIANCE: ["ADMIN", "MANAGER"],
  inviteCLIENT: ["ADMIN", "MANAGER", "CSR"],
  updateEmail: ["ADMIN", "MANAGER"],
  removeUser: ["ADMIN"],
  suspendUser: ["ADMIN", "MANAGER"],
  branding: ["ADMIN"],
  companySettings: ["ADMIN"],
  operationalSettings: ["ADMIN", "MANAGER"],
  auditLog: ["ADMIN"],
  viewClients: ALL_STAFF,
  viewClient: [...ALL_STAFF, "CLIENT"],
  assignNewClient: ["ADMIN", "MANAGER", "CSR"],
  reassignClient: ["ADMIN", "MANAGER"],
  docsAccess: ["ADMIN", "MANAGER", "COMPLIANCE", "CLIENT"],
  docsManage: ["ADMIN", "MANAGER", "COMPLIANCE"],
  docsReview: ["ADMIN", "MANAGER", "COMPLIANCE"],
  // Backend-only rule: deleting is a soft delete (the record and file are kept), and only the roles that run the portal may do it.
  deleteDocument: ["ADMIN", "MANAGER"],
  conversation: [...ALL_STAFF, "CLIENT"],
  attachStaff: ["ADMIN", "MANAGER", "COMPLIANCE"],
  reportSend: ["CSR"],
  reportView: ALL_STAFF,
  reportReview: ["COMPLIANCE"],
  announce: ["ADMIN", "MANAGER", "COMPLIANCE"],
  manageProjects: ["ADMIN", "MANAGER"],
  // Backend-only rule (the prototype let any stage move in any direction): moving a case backward is an explicit,
  // reasoned rollback that only the roles allowed to "move any stage" may perform.
  rollbackStage: ["ADMIN", "MANAGER"],
  complianceMilestones: ["ADMIN", "MANAGER", "COMPLIANCE"],
  viewProjects: ALL_STAFF,
  followUpTask: ["ADMIN", "MANAGER", "CSR"],
  complianceTask: ["ADMIN", "MANAGER", "COMPLIANCE"],
  allTasks: ["ADMIN", "MANAGER"],
  ticketsStaff: ALL_STAFF,
  ticketOwn: ["CLIENT"],
  manageTriggers: ["ADMIN", "MANAGER"],
  manageTemplates: ["ADMIN"],
  editCase: ["ADMIN", "MANAGER"],
  manageServices: ["ADMIN", "MANAGER"],
  viewServices: ALL_STAFF,
  analytics: ["ADMIN", "MANAGER"],
  followups: ["ADMIN", "MANAGER", "CSR"],
  filingTracker: ["ADMIN", "MANAGER", "COMPLIANCE"],
  caseNotes: ALL_STAFF,
  caseNotesCompliance: ["ADMIN", "MANAGER", "COMPLIANCE"],
  help: ALL_STAFF,
  manageTasks: ["ADMIN", "MANAGER"],
  reportAck: ["COMPLIANCE"],
};

export const REASON: Record<Permission | "default", string> = {
  removeUser:
    "Only Admin can remove users from the portal. Admin and Manager can suspend an account instead, which keeps every record.",
  branding: "Only Admin can change the company name and logo.",
  companySettings: "Company-wide settings are limited to Admin.",
  operationalSettings: "Operational settings are limited to Admin and Manager.",
  auditLog: "The audit log is limited to Admin.",
  reassignClient: "Only Admin and Manager can change the CSR of a client who already has one.",
  assignNewClient: "This client already has a CSR. Ask an Admin or Manager to reassign them.",
  docsAccess:
    "CSRs can't open, preview, download or upload client documents, by any route. You can still see whether a document is required, awaiting review, approved or needs a correction.",
  docsManage: "Only Admin, Manager and Compliance can upload or request client documents.",
  docsReview: "Only Admin, Manager and Compliance can review documents.",
  deleteDocument: "Only Admin and Manager can delete documents. They are kept for the record and hidden from everyone else.",
  viewClient: "You can only open records you're authorized to see.",
  viewClients: "You can only open records you're authorized to see.",
  updateEmail:
    "You can't change this user's email. Managers can update CSR, Compliance and client emails, but not Admin or other Manager accounts.",
  suspendUser:
    "You can't suspend this account. Managers can't suspend Admin or Manager accounts, and nobody can suspend themselves.",
  inviteMANAGER: "Only Admin can invite Managers.",
  inviteCSR: "Only Admin and Manager can invite CSRs.",
  inviteCOMPLIANCE: "Only Admin and Manager can invite Compliance users.",
  inviteCLIENT: "Only Admin, Manager and CSR can invite clients.",
  announce: "Only Admin, Manager and Compliance can publish announcements.",
  conversation: "You can only open conversations for clients in your scope.",
  attachStaff: "CSRs can't attach files to client conversations.",
  reportSend: "Only CSRs send reports to Compliance, about their own clients.",
  reportView: "Reports are internal and visible only to staff.",
  reportReview: "Only Compliance marks reports reviewed.",
  manageProjects: "Only Admin and Manager can create projects or move any formation stage.",
  complianceMilestones:
    "You can't update this milestone. Compliance can move document stages; CSRs can only view progress.",
  rollbackStage: "Only Admin and Manager can move a case back to an earlier stage, and only with a reason.",
  viewProjects: "Projects are visible to staff only.",
  followUpTask: "CSRs can add follow-up tasks for their own clients.",
  complianceTask: "Only Compliance, Admin and Manager can add compliance tasks.",
  allTasks: "Only Admin and Manager can see every task.",
  ticketsStaff: "You can only handle tickets for clients in your scope.",
  ticketOwn: "Clients can only change their own tickets.",
  manageTriggers: "Only Admin and Manager can change notification triggers.",
  manageTemplates: "Only Admin can change email templates.",
  editCase: "Only Admin and Manager can create cases or edit case details and team assignments.",
  manageServices: "Only Admin and Manager can edit the service catalog.",
  viewServices: "The service catalog is visible to staff only.",
  analytics: "Reports & Analytics are limited to Admin and Manager.",
  followups: "Follow-ups are limited to the client's CSR, Manager and Admin.",
  filingTracker: "The filing tracker is limited to Compliance, Manager and Admin.",
  caseNotes: "You can only add notes to cases in your scope.",
  caseNotesCompliance: "Compliance-only notes are visible to Compliance, Manager and Admin.",
  help: "The staff help center is available to staff accounts.",
  manageTasks: "Only Admin and Manager can assign or edit any task.",
  reportAck: "Only Compliance acknowledges CSR reports.",
  default: "Your role doesn't allow this action.",
};

/** Stages Compliance may move a case into (the same three the frontend allows). */
export const COMPLIANCE_STAGES: readonly string[] = ["DOCUMENTS_PENDING", "DOCUMENTS_UNDER_REVIEW", "READY_FOR_FILING"];

/** Who is asking. `status` must be ACTIVE for any permission to be granted. */
export interface PermissionActor {
  id: string;
  role: Role;
  status: string;
}

/** Attributes of the thing being acted on. Only the fields a rule needs have to be present. */
export interface PermissionResource {
  id?: string | number;
  role?: Role;
  /** The CSR assigned to the client the resource belongs to. */
  csr?: string | null;
  /** The client who owns the resource (document, ticket, ...). */
  client?: string;
  csrOf?: string | null;
  /** The stage a case would move into. */
  target?: string;
  /** The stage the case is in now. */
  current?: string;
}

/**
 * The single permission check. Every state-changing route goes through it (see PermissionsGuard), so a
 * crafted request is refused the same way a disabled button would be.
 */
export function can(user: PermissionActor | undefined, perm: Permission, res?: PermissionResource): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  if (!PERMS[perm].includes(user.role)) return false;
  const role = user.role;

  if ((perm === "updateEmail" || perm === "suspendUser") && res) {
    if (role === "MANAGER" && (res.role === "ADMIN" || (res.role === "MANAGER" && res.id !== user.id))) return false;
    if (perm === "suspendUser" && res.id === user.id) return false;
  }
  if (perm === "removeUser" && res && res.id === user.id) return false;
  if ((perm === "viewClient" || perm === "conversation") && res) {
    if (role === "CSR" && res.csr && res.csr !== user.id) return false;
    if (role === "CLIENT" && res.id !== user.id) return false;
  }
  if (perm === "docsAccess" && role === "CLIENT" && res && res.client !== user.id) return false;
  if (perm === "assignNewClient" && res && res.csr) return false;
  if ((perm === "reportSend" || perm === "followUpTask") && role === "CSR" && res && res.csr !== user.id) return false;
  if (perm === "reportView" && role === "CSR" && res && res.csr !== user.id) return false;
  if (perm === "ticketsStaff" && role === "CSR" && res && res.csrOf && res.csrOf !== user.id) return false;
  if (perm === "ticketOwn" && res && res.client !== user.id) return false;
  if ((perm === "followups" || perm === "caseNotes") && role === "CSR" && res && res.csr !== user.id) return false;
  if (perm === "complianceMilestones" && role === "COMPLIANCE" && res) {
    // Compliance moves cases only between the document stages: both where the case is and where it would go.
    if (res.target !== undefined && !COMPLIANCE_STAGES.includes(res.target)) return false;
    if (res.current !== undefined && !COMPLIANCE_STAGES.includes(res.current)) return false;
  }
  return true;
}

/** The 18 capabilities shown in the access matrix, in display order. */
export const ACCESS_MATRIX: ReadonlyArray<readonly [string, Permission]> = [
  ["Invite Managers", "inviteMANAGER"],
  ["Invite CSRs", "inviteCSR"],
  ["Invite Compliance", "inviteCOMPLIANCE"],
  ["Invite clients", "inviteCLIENT"],
  ["Update users' email", "updateEmail"],
  ["Remove users from the portal", "removeUser"],
  ["Change company name and logo", "branding"],
  ["Assign a new client to a CSR", "assignNewClient"],
  ["Reassign an existing client", "reassignClient"],
  ["Open client documents", "docsAccess"],
  ["Upload or request documents", "docsManage"],
  ["Client team conversations", "conversation"],
  ["Send reports to Compliance", "reportSend"],
  ["Review CSR reports", "reportReview"],
  ["Publish announcements", "announce"],
  ["Create projects, move any stage", "manageProjects"],
  ["Handle tickets (staff)", "ticketsStaff"],
  ["Company-wide settings", "companySettings"],
];

/** Map a permission to an audit-log category, used to filter the audit table. */
export function auditCategoryOf(perm?: Permission): string {
  if (!perm) return "";
  if (/^invite|removeUser|suspendUser|updateEmail/.test(perm)) return "users";
  if (/^docs|attachStaff|deleteDocument/.test(perm)) return "docs";
  if (/^ticket/.test(perm)) return "tickets";
  if (/complianceMilestones|manageProjects|rollbackStage|editCase|caseNotes|assignNewClient|reassignClient|followUpTask|complianceTask|manageTasks|filingTracker|followups/.test(perm)) {
    return "cases";
  }
  if (/^report/.test(perm)) return "reports";
  if (/branding|companySettings|operationalSettings|manageTriggers|manageTemplates|manageServices|auditLog/.test(perm)) return "settings";
  return "other";
}
