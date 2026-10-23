import { fmtAt } from "@/lib/dates";
import type { Report, ReportHistory, ReportThreadMsg } from "@/types/domain";
import { toMs, type Ref } from "./common";
import { PRIORITY, REPORT_CATEGORY, REPORT_STATUS, ROLES } from "./enums";

export interface ApiReportMessage {
  id: string;
  text: string;
  isNote: boolean;
  author: { id: string; name: string; role: string };
  at: string;
}

export interface ApiReportEvent {
  id: string;
  status: string;
  statusLabel: string;
  by: Ref;
  at: string;
}

/** `GET /reports` (no thread) and `GET /reports/:id`. */
export interface ApiReport {
  id: string;
  number: number;
  displayNumber: string;
  title: string;
  body: string;
  category: string;
  priority: string;
  action: string;
  status: string;
  statusLabel: string;
  client: { id: string; name: string; caseNumber: string };
  csr: Ref;
  case: { id: string; displayNumber: string } | null;
  createdAt: string;
  updatedAt: string;
  messages?: ApiReportMessage[];
  events?: ApiReportEvent[];
}

function mapMessage(m: ApiReportMessage): ReportThreadMsg {
  const at = toMs(m.at) ?? 0;
  return { id: m.id, from: m.author.id, fromName: m.author.name, fromRole: ROLES.toLabel(m.author.role), text: m.text, time: fmtAt(at), at };
}

function mapEvent(e: ApiReportEvent): ReportHistory {
  return { status: REPORT_STATUS.toLabel(e.status), by: e.by.id, byName: e.by.name, at: toMs(e.at) ?? 0 };
}

export function mapReport(r: ApiReport): Report {
  const createdAt = toMs(r.createdAt) ?? 0;
  const messages = r.messages ?? [];
  return {
    id: r.id,
    display: r.displayNumber,
    client: r.client.id,
    clientName: r.client.name,
    clientCaseId: r.client.caseNumber,
    csr: r.csr.id,
    csrName: r.csr.name,
    project: r.case?.displayNumber ?? "",
    caseId: r.case?.id,
    title: r.title,
    body: r.body,
    category: REPORT_CATEGORY.toLabel(r.category),
    priority: PRIORITY.toLabel(r.priority),
    action: r.action,
    status: REPORT_STATUS.toLabel(r.status),
    created: fmtAt(createdAt),
    createdAt,
    thread: messages.filter((m) => !m.isNote).map(mapMessage),
    notes: messages.filter((m) => m.isNote).map(mapMessage),
    history: (r.events ?? []).map(mapEvent),
  };
}
