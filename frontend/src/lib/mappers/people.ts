import type { CaseBrief, FollowUpType, User } from "@/types/domain";
import { toDay, toMs, type Ref } from "./common";
import { CASE_STAGE, CASE_STATUS, CONTACT_PREFERENCE, FOLLOW_UP_TYPE, PRIORITY, ROLES, USER_STATUS } from "./enums";

/** A case in the short form the server sends beside a client (`GET /clients`). */
export interface ApiCaseBrief {
  id: string;
  number: number;
  displayNumber: string;
  serviceId: string;
  stage: string;
  status: string;
  priority: string;
  deadline: string | null;
  lastActivityAt?: string | null;
}

export function mapCaseBrief(c: ApiCaseBrief): CaseBrief {
  return {
    id: c.id,
    display: c.displayNumber,
    stageIdx: Math.max(0, CASE_STAGE.index(c.stage)),
    stage: CASE_STAGE.toLabel(c.stage),
    status: CASE_STATUS.toLabel(c.status),
    priority: PRIORITY.toLabel(c.priority),
    serviceId: c.serviceId,
    deadline: toDay(c.deadline),
    lastActivityAt: toMs(c.lastActivityAt),
  };
}

/** `GET /users` and `GET /users/:id`. */
export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  invitedById: string | null;
  invitedByName: string | null;
  lastLoginAt: string | null;
  lastActivityAt?: string | null;
  workload?: {
    clients: number;
    cases: number;
    openTasks: number;
    overdueTasks: number;
    openFollowUps: number;
    openTickets: number;
    reviewsLast30Days: number;
  };
  caseNumber: string | null;
}

export function mapUser(u: ApiUser): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: ROLES.toLabel(u.role),
    status: USER_STATUS.toLabel(u.status),
    ...(u.caseNumber ? { caseId: u.caseNumber } : {}),
    invitedBy: u.invitedById ?? undefined,
    invitedByName: u.invitedByName,
    lastLoginAt: toMs(u.lastLoginAt),
    lastActivityAt: toMs(u.lastActivityAt),
    ...(u.workload ? { workload: u.workload } : {}),
  };
}

/** `GET /clients` and `GET /clients/:id`. */
export interface ApiClient {
  id: string;
  email: string;
  name: string;
  status: string;
  caseNumber: string;
  businessName: string;
  formationState: string;
  phone: string;
  contactPreference: string;
  csr: Ref | null;
  joinedAt: string | null;
  createdAt: string;
  case: ApiCaseBrief | null;
  lastContactAt?: string | null;
  nextFollowUp?: { id: string; due: string; type: string } | null;
  onboarding?: { done: number; total: number };
  address?: string;
  preferredName?: string;
  cases?: ApiCaseBrief[];
}

export function mapClient(c: ApiClient): User {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    role: "CLIENT",
    status: USER_STATUS.toLabel(c.status),
    caseId: c.caseNumber,
    csr: c.csr?.id ?? null,
    csrName: c.csr?.name ?? null,
    biz: c.businessName,
    state: c.formationState,
    phone: c.phone,
    address: c.address ?? "",
    contactPref: CONTACT_PREFERENCE.toLabel(c.contactPreference),
    preferred: c.preferredName ?? "",
    joinedAt: toMs(c.joinedAt),
    lastContactAt: toMs(c.lastContactAt),
    ...(c.nextFollowUp !== undefined
      ? { nextFollowUp: c.nextFollowUp ? { id: c.nextFollowUp.id, due: toDay(c.nextFollowUp.due), type: FOLLOW_UP_TYPE.toLabel(c.nextFollowUp.type) as FollowUpType } : null }
      : {}),
    ...(c.onboarding ? { onboarding: c.onboarding } : {}),
    currentCase: c.case ? mapCaseBrief(c.case) : null,
    ...(c.cases ? { cases: c.cases.map(mapCaseBrief) } : {}),
  };
}

export interface DirectoryPerson {
  id: string;
  name: string;
  role: ReturnType<typeof ROLES.toLabel>;
}

/** `GET /users/directory`. */
export function mapDirectoryPerson(p: { id: string; name: string; role: string }): DirectoryPerson {
  return { id: p.id, name: p.name, role: ROLES.toLabel(p.role) };
}

/** What the "Reassign / contact preference" selects send back. */
export const contactPreferenceKey = (label: string): string => CONTACT_PREFERENCE.toKey(label);
