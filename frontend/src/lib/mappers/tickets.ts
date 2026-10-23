import { fmtAt } from "@/lib/dates";
import type { Ticket, TicketEvent, TicketStatus, TicketThreadMsg } from "@/types/domain";
import { toMs, type Ref } from "./common";
import { PRIORITY, ROLES, TICKET_CATEGORY, TICKET_STATUS } from "./enums";

/** `GET /tickets` and the head of `GET /tickets/:id`. */
export interface ApiTicket {
  id: string;
  number: number;
  displayNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  statusLabel: string;
  version: number;
  allowedStatuses: string[];
  client: { id: string; name: string; caseNumber: string };
  handler: Ref | null;
  case: { id: string; displayNumber: string } | null;
  escalated?: boolean;
  resolution: { note: string; by: Ref | null; at: string | null } | null;
  createdAt: string;
  updatedAt: string;
  messages?: ApiTicketMessage[];
  events?: ApiTicketEvent[];
}

export interface ApiTicketMessage {
  id: string;
  text: string;
  internal: boolean;
  author: { id: string; name: string; role: string };
  at: string;
}

export interface ApiTicketEvent {
  id: string;
  from: string | null;
  to: string;
  note: string;
  by: { id: string; name: string; role: string };
  at: string;
}

export function mapTicketMessage(m: ApiTicketMessage): TicketThreadMsg {
  const at = toMs(m.at) ?? 0;
  return { id: m.id, from: m.author.id, fromName: m.author.name, fromRole: ROLES.toLabel(m.author.role), text: m.text, time: fmtAt(at), at, internal: m.internal };
}

export function mapTicketEvent(e: ApiTicketEvent): TicketEvent {
  const at = toMs(e.at) ?? 0;
  return {
    id: e.id,
    from: e.from ? TICKET_STATUS.toLabel(e.from) : "",
    to: TICKET_STATUS.toLabel(e.to),
    by: e.by.id,
    byName: e.by.name,
    byRole: ROLES.toLabel(e.by.role),
    time: fmtAt(at),
    at,
    note: e.note,
  };
}

export function mapTicket(t: ApiTicket): Ticket {
  const createdAt = toMs(t.createdAt) ?? 0;
  const resolvedAt = toMs(t.resolution?.at);
  return {
    id: t.id,
    display: t.displayNumber,
    client: t.client.id,
    clientName: t.client.name,
    clientCaseId: t.client.caseNumber,
    title: t.title,
    category: TICKET_CATEGORY.toLabel(t.category),
    priority: PRIORITY.toLabel(t.priority),
    status: TICKET_STATUS.toLabel(t.status),
    allowedStatuses: (t.allowedStatuses ?? []).map((s) => TICKET_STATUS.toLabel(s) as TicketStatus),
    version: t.version,
    handler: t.handler?.id ?? "",
    handlerName: t.handler?.name ?? "",
    created: fmtAt(createdAt),
    createdAt,
    updated: fmtAt(toMs(t.updatedAt)),
    desc: t.description,
    resolution: t.resolution ? { byName: t.resolution.by?.name ?? "—", time: fmtAt(resolvedAt), note: t.resolution.note, at: resolvedAt } : null,
    thread: (t.messages ?? []).map(mapTicketMessage),
    events: (t.events ?? []).map(mapTicketEvent),
    escalated: Boolean(t.escalated),
    project: t.case?.displayNumber ?? "",
  };
}
