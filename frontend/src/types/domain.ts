export type Role = "ADMIN" | "MANAGER" | "CSR" | "COMPLIANCE" | "CLIENT";
export type StaffRole = Exclude<Role, "CLIENT">;
export type UserStatus = "Active" | "Invited" | "Suspended" | "Removed";

export interface ChannelPref {
  email: boolean;
  app: boolean;
}
export interface NotificationPrefs {
  msg: ChannelPref;
  docs: ChannelPref;
  stage: ChannelPref;
  tickets: ChannelPref;
  anns: ChannelPref;
}

/** The staff directory's counts for one person (`GET /users`). */
export interface StaffWorkload {
  clients: number;
  cases: number;
  openTasks: number;
  overdueTasks: number;
  openFollowUps: number;
  openTickets: number;
  reviewsLast30Days: number;
}

/** A case in brief, as shown beside a client. `id` is the API id; `display` is the PRJ- number people read. */
export interface CaseBrief {
  id: string;
  display: string;
  stageIdx: number;
  stage: string;
  status: CaseStatus;
  priority: Priority;
  serviceId: string;
  deadline: string;
  lastActivityAt?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  caseId?: string;
  csr?: string | null;
  csrName?: string | null;
  invitedByName?: string | null;
  lastLoginAt?: number;
  /** Staff: the latest allowed action in the audit log. */
  lastActivityAt?: number;
  workload?: StaffWorkload;
  /** Clients (list and detail): when the team last reached them, their next open follow-up, onboarding progress. */
  lastContactAt?: number;
  nextFollowUp?: { id: string; due: string; type: FollowUpType } | null;
  onboarding?: { done: number; total: number };
  currentCase?: CaseBrief | null;
  cases?: CaseBrief[];
  biz?: string;
  state?: string;
  invitedBy?: string;
  phone?: string;
  address?: string;
  contactPref?: string;
  preferred?: string;
  joinedAt?: number;
  prefs?: NotificationPrefs;
}

export type CaseStatus =
  | "Not Started"
  | "In Progress"
  | "Awaiting Client"
  | "Under Review"
  | "Filing in Progress"
  | "Completed"
  | "On Hold"
  | "Active"
  | "Blocked";
export type Priority = "Low" | "Normal" | "High" | "Urgent";
export type NoteVisibility = "staff" | "compliance";

export interface CaseNote {
  /** The API id. */
  id: string;
  by: string;
  byName: string;
  vis: NoteVisibility;
  text: string;
  at: number;
}
export interface CaseEvent {
  to: string;
  by: string;
  byName: string;
  at: number;
  note: string;
}
/** A case. `id` is the number people read (PRJ-118); `apiId` is what the API and the address bar use. */
export interface Project {
  id: string;
  apiId: string;
  /** Optimistic-lock version: sent back with every edit and stage move. */
  version: number;
  client: string;
  clientName: string;
  clientCaseId: string;
  biz: string;
  state: string;
  csr: string | null;
  csrName: string | null;
  stageIdx: number;
  status: CaseStatus;
  filing: string;
  service: string;
  serviceName: string;
  priority: Priority;
  deadline: string;
  createdAt: number;
  completedAt?: number;
  last: number;
  owner?: string;
  ownerName?: string;
  notes: CaseNote[];
  events: CaseEvent[];
  /** Detail only: task counts for the case. */
  taskCounts?: { total: number; open: number; overdue: number };
}

export type TaskType = "Compliance" | "CSR follow-up" | "Operations";
export type Visibility = "internal" | "client";
export interface Task {
  /** The API id. */
  id: string;
  /** The case's display number (PRJ-118) and API id. */
  project: string;
  projectApiId: string;
  client: string;
  clientName: string;
  title: string;
  type: TaskType;
  vis: Visibility;
  done: boolean;
  overdue: boolean;
  by: string;
  byName: string;
  assignee: string;
  assigneeName: string;
  completedByName?: string;
  due: string;
  priority: Priority;
  createdAt: number;
  completedAt?: number;
}

export type DocStatus = "requested" | "submitted" | "approved" | "rejected" | "shared" | "info";
export interface DocHistory {
  status: DocStatus;
  by: string;
  byName?: string;
  at: number;
  note: string;
}
export interface ClientDoc {
  /** The API id. */
  id: string;
  client: string;
  clientName?: string;
  clientCaseId?: string;
  name: string;
  /** The file name; empty when nothing is uploaded or the viewer (a CSR) may not see it. */
  file: string;
  status: DocStatus;
  reason: string;
  type: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  requestedAt: number;
  requestedBy?: string;
  requestedByName?: string;
  submittedAt?: number;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewedByName?: string;
  note?: string;
  history: DocHistory[];
}

export interface MessageAttachment {
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
}
export interface Message {
  id: string;
  from: string;
  fromName: string;
  fromRole: Role;
  text: string;
  time: string;
  at: number;
  mine: boolean;
  attachment: MessageAttachment | null;
}

/** One line of the conversation list. `writable` is false for a suspended or removed client (read-only thread). */
export interface Conversation {
  client: { id: string; name: string; status: UserStatus; caseId: string; biz: string };
  last: { text: string; fromName: string; hasAttachment: boolean; at: number } | null;
  unread: number;
  writable: boolean;
}

export type ReportStatus = "Submitted" | "Acknowledged" | "Clarification requested" | "Reviewed";
export interface ReportThreadMsg {
  id?: string;
  from: string;
  fromName?: string;
  fromRole?: Role;
  text: string;
  time: string;
  at?: number;
}
export interface ReportHistory {
  status: string;
  by: string;
  byName?: string;
  at: number;
}
export interface Report {
  /** The API id. */
  id: string;
  /** What people read: RPT-201. */
  display: string;
  client: string;
  clientName?: string;
  clientCaseId?: string;
  csr: string;
  csrName?: string;
  /** The case, as PRJ-118 (empty when none). */
  project: string;
  caseId?: string;
  title: string;
  body: string;
  category: string;
  priority: Priority;
  action: string;
  status: ReportStatus;
  created: string;
  createdAt: number;
  thread: ReportThreadMsg[];
  notes: ReportThreadMsg[];
  history: ReportHistory[];
}

export type AnnouncementStatus = "Draft" | "Published" | "Archived";
export type AnnouncementPriority = "Normal" | "Important" | "Urgent";
export interface Announcement {
  id: string;
  title: string;
  msg: string;
  /** "all", or the id of the one client it is for. */
  aud: string;
  audName: string;
  prio: AnnouncementPriority;
  /** Staff only for Draft and Archived; a client only ever receives Published. */
  status: AnnouncementStatus;
  by: string;
  byName: string;
  /** Acknowledgement is required. */
  ack: boolean;
  /** Clients: this person has acknowledged. */
  acked: boolean;
  /** Staff: how many have acknowledged, of how many. */
  acks: { done: number; total: number } | null;
  date: string;
  exp: string;
}

export interface AnnouncementAcks {
  done: number;
  total: number;
  clients: Array<{ id: string; name: string; caseId: string; acknowledged: boolean; at?: number }>;
}

export type TicketStatus =
  | "Open"
  | "In Progress"
  | "Waiting for Client"
  | "Waiting for Internal Team"
  | "Resolved"
  | "Closed";
export interface TicketThreadMsg {
  id: string;
  from: string;
  fromName: string;
  fromRole: Role;
  text: string;
  time: string;
  at: number;
  internal: boolean;
}
export interface TicketEvent {
  id: string;
  from: string;
  to: string;
  by: string;
  byName: string;
  byRole: Role;
  time: string;
  at: number;
  note: string;
}
export interface Ticket {
  /** The API id (what the address bar and the requests carry). */
  id: string;
  /** TKT-1004, what people read. */
  display: string;
  client: string;
  clientName: string;
  clientCaseId: string;
  title: string;
  category: string;
  priority: string;
  status: TicketStatus;
  /** The statuses the server will accept next from this person (staff: the workflow; client: confirm / reopen). */
  allowedStatuses: TicketStatus[];
  version: number;
  handler: string;
  handlerName: string;
  created: string;
  createdAt: number;
  updated: string;
  desc: string;
  resolution: { byName: string; time: string; note: string; at?: number } | null;
  thread: TicketThreadMsg[];
  events: TicketEvent[];
  escalated: boolean;
  /** PRJ-118 of the related case, or "". */
  project: string;
}

export interface AppNotification {
  id?: string;
  text: string;
  time: string;
  unread: boolean;
  link?: string;
  at?: number;
}

export interface AuditEntry {
  id?: string;
  time: string;
  at: number;
  actor: string;
  actorName?: string;
  requestId?: string | null;
  role?: Role;
  action: string;
  target: string;
  ok: boolean;
  cat?: string;
}

export interface Trigger {
  k: string;
  name: string;
  on: boolean;
  tpl: string;
  opts: string[];
  security?: boolean;
}

export type FollowUpType = "Call" | "Email" | "Portal message" | "Meeting";
export interface FollowUp {
  /** The API id. */
  id: string;
  client: string;
  clientName: string;
  clientCaseId: string;
  csr: string;
  csrName: string;
  type: FollowUpType;
  due: string;
  status: "Open" | "Done";
  overdue: boolean;
  note: string;
  outcome?: string;
  doneAt?: number;
  createdAt: number;
}
export interface Interaction {
  id: string;
  client: string;
  by: string;
  byName: string;
  kind: FollowUpType;
  text: string;
  at: number;
}

export type FilingStatus =
  | "Not submitted"
  | "Submitted"
  | "Pending state review"
  | "Approved"
  | "Rejected";
export interface Filing {
  /** The API id. */
  id: string;
  /** FIL-9. */
  display: string;
  /** The case's API id, and its PRJ- number. */
  caseId: string;
  project: string;
  clientId: string;
  clientName: string;
  /** The client's formation state (empty when not chosen). */
  state: string;
  type: string;
  submitted: string;
  status: FilingStatus;
  ref: string;
  updated: number;
  next: string;
  nextDate: string;
  outcome: string;
  /** The next action date has passed and the filing is not approved. */
  late: boolean;
}

export interface Reminder {
  id: string;
  /** The case's API id, and its PRJ- number. */
  caseId: string;
  project: string;
  title: string;
  date: string;
  kind: string;
  illustrative: boolean;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  desc: string;
  reqs: string[];
  stages: string[];
  turnaround: string;
  fee: string;
  active: boolean;
  /** Staff list only: unfinished cases opened for this service. */
  activeCases?: number;
}

export interface Company {
  name: string;
  logo: string;
  casePrefix: string;
}
