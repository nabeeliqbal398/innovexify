import { CASE_STATUSES, DOC_TYPES, FILING_STATUSES, FOLLOW_UP_TYPES, PRIORITIES, REPORT_CATEGORIES, STAGES, TICKET_CATEGORIES, TICKET_STATUSES } from "@/constants/vocab";
import type {
  AnnouncementPriority,
  AnnouncementStatus,
  CaseStatus,
  DocStatus,
  FilingStatus,
  FollowUpType,
  NoteVisibility,
  Priority,
  ReportStatus,
  Role,
  TaskType,
  TicketStatus,
  UserStatus,
  Visibility,
} from "@/types/domain";

/**
 * The API speaks in enum keys (WAITING_FOR_CLIENT, DOCUMENTS_PENDING) and the screens in labels ("Waiting for Client").
 * One table per enum, keys in the same order as the label list, so a new value on the server can't silently shift the others.
 * `toLabel` falls back to a readable version of an unknown key instead of throwing or showing nothing.
 */
export interface EnumMap<L extends string> {
  keys: readonly string[];
  labels: readonly L[];
  toLabel: (key: string | null | undefined) => L;
  toKey: (label: string | null | undefined) => string;
  index: (key: string | null | undefined) => number;
}

/** "WAITING_FOR_CLIENT" becomes "Waiting for client": what an unknown key is shown as. */
export function humanize(key: string): string {
  const words = key.toLowerCase().split("_").filter(Boolean).join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "—";
}

export function enumMap<L extends string>(keys: readonly string[], labels: readonly L[], fallback?: L): EnumMap<L> {
  if (keys.length !== labels.length) throw new Error(`enumMap: ${keys.length} keys but ${labels.length} labels`);
  const index = (key: string | null | undefined): number => (key ? keys.indexOf(key) : -1);
  return {
    keys,
    labels,
    index,
    toLabel: (key) => {
      const i = index(key);
      if (i >= 0) return labels[i] as L;
      return (fallback ?? (humanize(key ?? "") as L)) as L;
    },
    toKey: (label) => {
      const i = label ? labels.indexOf(label as L) : -1;
      return i >= 0 ? (keys[i] as string) : (label ?? "");
    },
  };
}

export const ROLES = enumMap<Role>(["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"], ["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"]);

export const USER_STATUS = enumMap<UserStatus>(["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"], ["Active", "Invited", "Suspended", "Removed"]);

export const CASE_STAGE = enumMap<(typeof STAGES)[number]>(
  [
    "INVITATION_SENT",
    "CLIENT_ONBOARDING",
    "INFORMATION_REQUIRED",
    "DOCUMENTS_PENDING",
    "DOCUMENTS_UNDER_REVIEW",
    "READY_FOR_FILING",
    "STATE_FILING_IN_PROGRESS",
    "STATE_APPROVAL_RECEIVED",
    "EIN_PROCESSING",
    "POST_FORMATION_DOCUMENTS",
    "COMPLETED",
  ],
  STAGES,
);

export const CASE_STATUS = enumMap<CaseStatus>(
  ["NOT_STARTED", "IN_PROGRESS", "AWAITING_CLIENT", "UNDER_REVIEW", "FILING_IN_PROGRESS", "COMPLETED", "ON_HOLD", "ACTIVE", "BLOCKED"],
  ["Not Started", "In Progress", "Awaiting Client", "Under Review", "Filing in Progress", "Completed", "On Hold", "Active", "Blocked"],
);
/** The statuses an editor may choose; the other values are set by the stage. */
export const EDITABLE_CASE_STATUSES: readonly CaseStatus[] = CASE_STATUSES.filter((s) => s !== "Completed");

export const PRIORITY = enumMap<Priority>(["LOW", "NORMAL", "HIGH", "URGENT"], PRIORITIES);

export const TICKET_STATUS = enumMap<TicketStatus>(
  ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM", "RESOLVED", "CLOSED"],
  TICKET_STATUSES,
);
export const TICKET_CATEGORY = enumMap<(typeof TICKET_CATEGORIES)[number]>(
  ["FORMATION_DELAY", "DOCUMENT_PROBLEM", "INCORRECT_INFORMATION", "COMMUNICATION_ISSUE", "GENERAL_REQUEST", "TECHNICAL_PROBLEM", "COMPLAINT"],
  TICKET_CATEGORIES,
);

export const DOC_STATUS_MAP = enumMap<DocStatus>(
  ["REQUESTED", "SUBMITTED", "APPROVED", "REJECTED", "SHARED", "INFO"],
  ["requested", "submitted", "approved", "rejected", "shared", "info"],
);
export const DOC_TYPE = enumMap<(typeof DOC_TYPES)[number]>(["IDENTITY", "ADDRESS", "FORMATION", "TAX", "AGREEMENT", "OTHER"], DOC_TYPES);

export const FOLLOW_UP_TYPE = enumMap<FollowUpType>(["CALL", "EMAIL", "PORTAL_MESSAGE", "MEETING"], FOLLOW_UP_TYPES);
export const FOLLOW_UP_STATUS = enumMap<"Open" | "Done">(["OPEN", "DONE"], ["Open", "Done"]);

export const TASK_TYPE = enumMap<TaskType>(["COMPLIANCE", "CSR_FOLLOW_UP", "OPERATIONS"], ["Compliance", "CSR follow-up", "Operations"]);
export const TASK_VISIBILITY = enumMap<Visibility>(["INTERNAL", "CLIENT"], ["internal", "client"]);
export const NOTE_VISIBILITY = enumMap<NoteVisibility>(["STAFF", "COMPLIANCE"], ["staff", "compliance"]);

export const FILING_STATUS = enumMap<FilingStatus>(
  ["NOT_SUBMITTED", "SUBMITTED", "PENDING_STATE_REVIEW", "APPROVED", "REJECTED"],
  FILING_STATUSES,
);

export const REPORT_STATUS = enumMap<ReportStatus>(
  ["SUBMITTED", "ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "REVIEWED"],
  ["Submitted", "Acknowledged", "Clarification requested", "Reviewed"],
);
export const REPORT_CATEGORY = enumMap<(typeof REPORT_CATEGORIES)[number]>(
  ["MISSING_INFORMATION", "DOCUMENT_QUESTION", "CLIENT_CONCERN", "FILING_QUESTION", "TAX_EIN_QUESTION", "OTHER"],
  REPORT_CATEGORIES,
);

export const ANNOUNCEMENT_STATUS = enumMap<AnnouncementStatus>(["DRAFT", "PUBLISHED", "ARCHIVED"], ["Draft", "Published", "Archived"]);
export const ANNOUNCEMENT_PRIORITY = enumMap<AnnouncementPriority>(["NORMAL", "IMPORTANT", "URGENT"], ["Normal", "Important", "Urgent"]);

export const CONTACT_PREFERENCE = enumMap<"Portal message" | "Email" | "Phone">(["PORTAL_MESSAGE", "EMAIL", "PHONE"], ["Portal message", "Email", "Phone"]);

/** Notification preference categories: API key to the key the settings screen uses. */
export const PREF_CATEGORY = { MESSAGES: "msg", DOCUMENTS: "docs", STAGE: "stage", TICKETS: "tickets", ANNOUNCEMENTS: "anns" } as const;
export type PrefCategoryKey = keyof typeof PREF_CATEGORY;
export const PREF_API_KEY = { msg: "MESSAGES", docs: "DOCUMENTS", stage: "STAGE", tickets: "TICKETS", anns: "ANNOUNCEMENTS" } as const;
