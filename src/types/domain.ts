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

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  caseId?: string;
  csr?: string | null;
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
  id: number;
  by: string;
  vis: NoteVisibility;
  text: string;
  at: number;
}
export interface CaseEvent {
  to: string;
  by: string;
  at: number;
  note: string;
}
export interface Project {
  id: string;
  client: string;
  stageIdx: number;
  status: CaseStatus;
  filing: string;
  service: string;
  priority: Priority;
  deadline: string;
  createdAt: number;
  completedAt?: number;
  last: number;
  owner?: string;
  notes: CaseNote[];
  events: CaseEvent[];
}

export type TaskType = "Compliance" | "CSR follow-up" | "Operations";
export type Visibility = "internal" | "client";
export interface Task {
  id: number;
  project: string;
  title: string;
  type: TaskType;
  vis: Visibility;
  done: boolean;
  by: string;
  assignee: string;
  due: string;
  priority: Priority;
  createdAt: number;
  completedAt?: number;
}

export type DocStatus = "requested" | "submitted" | "approved" | "rejected" | "shared" | "info";
export interface DocHistory {
  status: DocStatus;
  by: string;
  at: number;
  note: string;
}
export interface ClientDoc {
  id: number;
  client: string;
  name: string;
  file: string;
  status: DocStatus;
  reason: string;
  type: string;
  requestedAt: number;
  requestedBy?: string;
  submittedAt?: number;
  reviewedAt?: number;
  reviewedBy?: string;
  note?: string;
  history: DocHistory[];
}

export interface Message {
  from: string;
  text: string;
  time: string;
  at?: number;
  attach?: string;
}

export type ReportStatus = "Submitted" | "Acknowledged" | "Clarification requested" | "Reviewed";
export interface ReportThreadMsg {
  from: string;
  text: string;
  time: string;
}
export interface ReportHistory {
  status: string;
  by: string;
  at: number;
}
export interface Report {
  id: string;
  client: string;
  csr: string;
  project: string;
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
  id: number;
  title: string;
  msg: string;
  aud: string;
  prio: AnnouncementPriority;
  status: AnnouncementStatus;
  by: string;
  ack: boolean;
  acks: Record<string, boolean>;
  date: string;
  exp: string;
}

export type TicketStatus =
  | "Open"
  | "In Progress"
  | "Waiting for Client"
  | "Waiting for Internal Team"
  | "Resolved"
  | "Closed";
export interface TicketThreadMsg {
  from: string;
  text: string;
  time: string;
  internal: boolean;
}
export interface TicketEvent {
  from: string;
  to: string;
  by: string;
  time: string;
  note: string;
}
export interface Ticket {
  id: string;
  client: string;
  title: string;
  category: string;
  priority: string;
  status: TicketStatus;
  handler: string;
  created: string;
  createdAt: number;
  updated: string;
  desc: string;
  resolution: { by: string; time: string; note: string; at?: number } | null;
  thread: TicketThreadMsg[];
  events: TicketEvent[];
  escalated: boolean;
  project: string;
}

export interface AppNotification {
  text: string;
  time: string;
  unread: boolean;
  link?: string;
  at?: number;
}

export interface AuditEntry {
  time: string;
  at: number;
  actor: string;
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
  id: number;
  client: string;
  csr: string;
  type: FollowUpType;
  due: string;
  status: "Open" | "Done";
  note: string;
  outcome?: string;
  doneAt?: number;
  createdAt: number;
}
export interface Interaction {
  id: number;
  client: string;
  by: string;
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
  id: string;
  project: string;
  type: string;
  submitted: string;
  status: FilingStatus;
  ref: string;
  updated: number;
  next: string;
  nextDate: string;
  outcome: string;
}

export interface Reminder {
  id: number;
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
}

export interface Company {
  name: string;
  logo: string;
  casePrefix: string;
}

export interface Counters {
  nextCase: number;
  nextUser: number;
  nextId: number;
  nextTicket: number;
  nextReport: number;
  nextPrj: number;
  nextFu: number;
  nextInt: number;
  nextFiling: number;
}

export interface DemoData {
  company: Company;
  users: User[];
  projects: Project[];
  tasks: Task[];
  docs: ClientDoc[];
  msgs: Record<string, Message[]>;
  lastRead: Record<string, Record<string, number>>;
  reports: Report[];
  anns: Announcement[];
  tickets: Ticket[];
  notifs: Record<string, AppNotification[]>;
  audit: AuditEntry[];
  triggers: Trigger[];
  followups: FollowUp[];
  interactions: Interaction[];
  filings: Filing[];
  reminders: Reminder[];
  services: Service[];
  counters: Counters;
  sessionStartedAt: number;
}
