import { ROLE_LABEL, type BadgeTone } from "@/constants/vocab";
import { fmtAt } from "@/lib/dates";
import type { CaseEvent, CaseNote, Project } from "@/types/domain";
import { toDay, toMs, type Ref } from "./common";
import { CASE_STAGE, CASE_STATUS, DOC_STATUS_MAP, FOLLOW_UP_TYPE, NOTE_VISIBILITY, PRIORITY, ROLES, TICKET_STATUS } from "./enums";
import { DOC_STATUS } from "@/constants/vocab";

interface ApiCaseClient extends Ref {
  email?: string;
  caseNumber?: string;
  businessName?: string;
  formationState?: string;
  csr?: Ref | null;
}

/** `GET /cases` and `GET /cases/:id`. */
export interface ApiCase {
  id: string;
  number: number;
  displayNumber: string;
  version: number;
  stage: string;
  status: string;
  priority: string;
  deadline: string | null;
  filingConfirmation: string;
  service: Ref;
  client: ApiCaseClient;
  owner: Ref | null;
  completedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  events?: Array<{ id: string; toStage: string | null; note: string; by: Ref | null; at: string }>;
  notes?: Array<{ id: string; visibility: string; text: string; author: Ref | null; createdAt: string }>;
  tasks?: { total: number; open: number; overdue: number };
}

export function mapCaseEvent(e: { toStage: string | null; note: string; by: Ref | null; at: string }): CaseEvent {
  return { to: e.toStage ? CASE_STAGE.toLabel(e.toStage) : "", by: e.by?.id ?? "", byName: e.by?.name ?? "—", at: toMs(e.at) ?? 0, note: e.note };
}

export function mapCaseNote(n: { id: string; visibility: string; text: string; author: Ref | null; createdAt: string }): CaseNote {
  return { id: n.id, by: n.author?.id ?? "", byName: n.author?.name ?? "—", vis: NOTE_VISIBILITY.toLabel(n.visibility), text: n.text, at: toMs(n.createdAt) ?? 0 };
}

export function mapCase(c: ApiCase): Project {
  return {
    id: c.displayNumber,
    apiId: c.id,
    version: c.version,
    client: c.client.id,
    clientName: c.client.name,
    clientCaseId: c.client.caseNumber ?? "",
    biz: c.client.businessName ?? "",
    state: c.client.formationState ?? "",
    csr: c.client.csr?.id ?? null,
    csrName: c.client.csr?.name ?? null,
    stageIdx: Math.max(0, CASE_STAGE.index(c.stage)),
    status: CASE_STATUS.toLabel(c.status),
    filing: c.filingConfirmation ?? "",
    service: c.service.id,
    serviceName: c.service.name,
    priority: PRIORITY.toLabel(c.priority),
    deadline: toDay(c.deadline),
    createdAt: toMs(c.createdAt) ?? 0,
    completedAt: toMs(c.completedAt),
    last: toMs(c.lastActivityAt) ?? 0,
    owner: c.owner?.id,
    ownerName: c.owner?.name,
    notes: (c.notes ?? []).map(mapCaseNote),
    events: (c.events ?? []).map(mapCaseEvent),
    ...(c.tasks ? { taskCounts: c.tasks } : {}),
  };
}

export const isDone = (p: Pick<Project, "stageIdx" | "status">): boolean => p.stageIdx >= 10 || p.status === "Completed";

/** The stage to send for the stage a screen names by label. */
export const stageKey = (label: string): string => CASE_STAGE.toKey(label);
export const priorityKey = (label: string): string => PRIORITY.toKey(label);
export const statusKey = (label: string): string => CASE_STATUS.toKey(label);

// ---- timeline -----------------------------------------------------------------------------------------------------

/** `GET /clients/:id/timeline`. */
export interface ApiTimelineEntry {
  id: string;
  kind: "CASE" | "DOCUMENT" | "TICKET" | "MESSAGE" | "INTERACTION" | "FOLLOW_UP" | "INVITATION";
  subKind: string | null;
  text: string;
  note: string;
  actor: { id: string; name: string; role: string } | null;
  at: string;
}

export interface TimelineEntry {
  id: string;
  kind: string;
  tone: BadgeTone;
  dot: string;
  text: string;
  note: string;
  who: string;
  role: string;
  time: string;
  at: number;
}

const STYLE: Record<ApiTimelineEntry["kind"], { tone: BadgeTone; dot: string }> = {
  CASE: { tone: "brand", dot: "bg-primary" },
  DOCUMENT: { tone: "violet", dot: "bg-violet" },
  TICKET: { tone: "warn", dot: "bg-warning" },
  MESSAGE: { tone: "info", dot: "bg-info" },
  INTERACTION: { tone: "teal", dot: "bg-teal" },
  FOLLOW_UP: { tone: "ok", dot: "bg-success" },
  INVITATION: { tone: "q", dot: "bg-neutral" },
};

export function mapTimelineEntry(e: ApiTimelineEntry): TimelineEntry {
  const at = toMs(e.at) ?? 0;
  let kind = "Case";
  let text = e.text;
  switch (e.kind) {
    case "CASE":
      text = e.subKind ? `Stage → ${CASE_STAGE.toLabel(e.subKind)}` : e.text;
      break;
    case "DOCUMENT":
      kind = "Document";
      text = `${e.text}: ${DOC_STATUS[DOC_STATUS_MAP.toLabel(e.subKind)]?.label ?? "Updated"}`;
      break;
    case "TICKET":
      kind = "Ticket";
      text = `${e.text.replace(" - ", " · ")} (${TICKET_STATUS.toLabel(e.subKind)})`;
      break;
    case "MESSAGE":
      kind = "Message";
      break;
    case "INTERACTION":
      kind = FOLLOW_UP_TYPE.toLabel(e.subKind);
      break;
    case "FOLLOW_UP":
      kind = "Follow-up";
      text = `${FOLLOW_UP_TYPE.toLabel(e.subKind)} completed: ${e.text}`;
      break;
    case "INVITATION":
      kind = "Invitation";
      break;
  }
  return {
    id: e.id,
    kind,
    ...STYLE[e.kind],
    text,
    note: e.note,
    who: e.actor?.name ?? "—",
    role: e.actor ? ROLE_LABEL[ROLES.toLabel(e.actor.role)] : "",
    time: fmtAt(at),
    at,
  };
}
