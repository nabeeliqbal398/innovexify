import type { Filing, Reminder } from "@/types/domain";
import { toDay, toMs, type Ref } from "./common";
import { FILING_STATUS } from "./enums";

/** `GET /filings`, `GET /cases/:id/filings`. */
export interface ApiFiling {
  id: string;
  number: number;
  displayNumber: string;
  case: { id: string; displayNumber: string; client: Ref & { formationState?: string } };
  type: string;
  status: string;
  submittedOn: string | null;
  reference: string;
  nextAction: string;
  nextActionDate: string | null;
  outcome: string;
  late: boolean;
  updatedAt: string;
}

export function mapFiling(f: ApiFiling): Filing {
  return {
    id: f.id,
    display: f.displayNumber,
    caseId: f.case.id,
    project: f.case.displayNumber,
    clientId: f.case.client.id,
    clientName: f.case.client.name,
    state: f.case.client.formationState ?? "",
    type: f.type,
    submitted: toDay(f.submittedOn),
    status: FILING_STATUS.toLabel(f.status),
    ref: f.reference,
    updated: toMs(f.updatedAt) ?? 0,
    next: f.nextAction,
    nextDate: toDay(f.nextActionDate),
    outcome: f.outcome,
    late: f.late,
  };
}

/** `GET /cases/:id/reminders`. The case is the one the request was made for. */
export interface ApiReminder {
  id: string;
  title: string;
  date: string;
  kind: string;
  illustrative: boolean;
  note?: string;
}

export function mapReminder(r: ApiReminder, caseId: string, caseDisplay = ""): Reminder {
  return { id: r.id, caseId, project: caseDisplay, title: r.title, date: toDay(r.date), kind: r.kind, illustrative: r.illustrative };
}

/** `GET /calendar`. */
export type CalendarKind = "case" | "filing" | "missing" | "task" | "reminder";
export interface ApiCalendarItem {
  key: string;
  kind: CalendarKind;
  date: string;
  title: string;
  clientName: string | null;
  caseId: string | null;
  caseDisplay: string | null;
  documentId: string | null;
  overdue: boolean;
}
export interface Calendar {
  items: Array<Omit<ApiCalendarItem, "date"> & { date: string }>;
  overdueTotal: number;
  truncated: boolean;
}

export function mapCalendar(c: { items: ApiCalendarItem[]; overdueTotal: number; truncated: boolean }): Calendar {
  return { items: c.items.map((i) => ({ ...i, date: toDay(i.date) })), overdueTotal: c.overdueTotal, truncated: c.truncated };
}

/** A case to pick from when adding a filing (`GET /cases`, only what a picker needs). */
export interface CaseOption {
  id: string;
  display: string;
  clientName: string;
}
export function mapCaseOption(c: { id: string; displayNumber: string; client: { name: string } }): CaseOption {
  return { id: c.id, display: c.displayNumber, clientName: c.client.name };
}
