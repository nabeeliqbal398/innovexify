import type {
  CaseStatus,
  DocStatus,
  FilingStatus,
  NotificationPrefs,
  Priority,
  Role,
  TicketStatus,
} from "@/types/domain";

export type BadgeTone = "ok" | "info" | "warn" | "err" | "q" | "brand" | "violet" | "dark" | "teal";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CSR: "CSR",
  COMPLIANCE: "Compliance",
  CLIENT: "Client",
};
export const ROLE_TONE: Record<Role, BadgeTone> = {
  ADMIN: "dark",
  MANAGER: "brand",
  CSR: "info",
  COMPLIANCE: "violet",
  CLIENT: "q",
};
export const ROLE_PATH: Record<Role, string> = {
  ADMIN: "admin",
  MANAGER: "manager",
  CSR: "csr",
  COMPLIANCE: "compliance",
  CLIENT: "client",
};
export const PATH_ROLE: Record<string, Role> = {
  admin: "ADMIN",
  manager: "MANAGER",
  csr: "CSR",
  compliance: "COMPLIANCE",
  client: "CLIENT",
};

export const STAGES = [
  "Invitation Sent",
  "Client Onboarding",
  "Information Required",
  "Documents Pending",
  "Documents Under Review",
  "Ready for Filing",
  "State Filing in Progress",
  "State Approval Received",
  "EIN Processing",
  "Post-Formation Documents",
  "Completed",
] as const;
export const COMP_STAGES: readonly string[] = [
  "Documents Pending",
  "Documents Under Review",
  "Ready for Filing",
];

export const CASE_STATUSES: CaseStatus[] = [
  "Active",
  "Awaiting Client",
  "Blocked",
  "On Hold",
  "Completed",
];
export const CASE_TONE: Record<string, BadgeTone> = {
  Active: "info",
  "Awaiting Client": "warn",
  Blocked: "err",
  "On Hold": "q",
  Completed: "ok",
  "Not Started": "q",
  "In Progress": "info",
  "Under Review": "violet",
  "Filing in Progress": "brand",
};

export const PRIORITIES: Priority[] = ["Low", "Normal", "High", "Urgent"];
export const PRIORITY_TONE: Record<string, BadgeTone> = {
  Low: "q",
  Normal: "q",
  High: "warn",
  Urgent: "err",
};

export const TICKET_STATUSES: TicketStatus[] = [
  "Open",
  "In Progress",
  "Waiting for Client",
  "Waiting for Internal Team",
  "Resolved",
  "Closed",
];
export const TICKET_TONE: Record<TicketStatus, BadgeTone> = {
  Open: "info",
  "In Progress": "brand",
  "Waiting for Client": "warn",
  "Waiting for Internal Team": "violet",
  Resolved: "ok",
  Closed: "q",
};
export const TICKET_CATEGORIES = [
  "Formation delay",
  "Document problem",
  "Incorrect client information",
  "Communication issue",
  "General service request",
  "Technical problem",
  "Complaint",
] as const;

export const DOC_STATUS: Record<DocStatus, { label: string; tone: BadgeTone }> = {
  requested: { label: "Required", tone: "violet" },
  submitted: { label: "Awaiting review", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Needs correction", tone: "err" },
  shared: { label: "Shared by team", tone: "brand" },
  info: { label: "More info needed", tone: "teal" },
};
export const DOC_TYPES = ["Identity", "Address", "Formation", "Tax", "Agreement", "Other"] as const;
export const FOLLOW_UP_TYPES = ["Call", "Email", "Portal message", "Meeting"] as const;
export const REPORT_CATEGORIES = [
  "Missing information",
  "Document question",
  "Client concern",
  "Filing question",
  "Tax / EIN question",
  "Other",
] as const;
export const FILING_STATUSES: FilingStatus[] = [
  "Not submitted",
  "Submitted",
  "Pending state review",
  "Approved",
  "Rejected",
];
export const FILING_TONE: Record<FilingStatus, BadgeTone> = {
  "Not submitted": "q",
  Submitted: "info",
  "Pending state review": "violet",
  Approved: "ok",
  Rejected: "err",
};
export const FORMATION_STATES = [
  "Wyoming",
  "Delaware",
  "New Mexico",
  "Florida",
  "Texas",
] as const;

export const DEFAULT_VIEW: Record<Role, string> = {
  ADMIN: "overview",
  MANAGER: "overview",
  CSR: "overview",
  COMPLIANCE: "overview",
  CLIENT: "home",
};

/** Both channels on, which is what the server uses for a category nobody has changed. */
export const NOTIFICATION_PREF_DEFAULTS: NotificationPrefs = {
  msg: { email: true, app: true },
  docs: { email: true, app: true },
  stage: { email: true, app: true },
  tickets: { email: true, app: true },
  anns: { email: true, app: true },
};
