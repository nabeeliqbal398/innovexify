import type { FollowUp, Interaction } from "@/types/domain";
import { toDay, toMs, type Ref } from "./common";
import { FOLLOW_UP_STATUS, FOLLOW_UP_TYPE } from "./enums";

/** `GET /followups`. */
export interface ApiFollowUp {
  id: string;
  client: Ref & { caseNumber?: string };
  csr: Ref;
  type: string;
  due: string;
  status: string;
  note: string;
  outcome: string;
  doneAt: string | null;
  overdue: boolean;
  createdAt: string;
}

export function mapFollowUp(f: ApiFollowUp): FollowUp {
  return {
    id: f.id,
    client: f.client.id,
    clientName: f.client.name,
    clientCaseId: f.client.caseNumber ?? "",
    csr: f.csr.id,
    csrName: f.csr.name,
    type: FOLLOW_UP_TYPE.toLabel(f.type),
    due: toDay(f.due),
    status: FOLLOW_UP_STATUS.toLabel(f.status),
    overdue: f.overdue,
    note: f.note,
    outcome: f.outcome || undefined,
    doneAt: toMs(f.doneAt),
    createdAt: toMs(f.createdAt) ?? 0,
  };
}

/** `GET /clients/:id/interactions`. */
export interface ApiInteraction {
  id: string;
  kind: string;
  text: string;
  by: Ref | null;
  at: string;
  clientId?: string;
}

export function mapInteraction(i: ApiInteraction, clientId = i.clientId ?? ""): Interaction {
  return { id: i.id, client: clientId, by: i.by?.id ?? "", byName: i.by?.name ?? "—", kind: FOLLOW_UP_TYPE.toLabel(i.kind), text: i.text, at: toMs(i.at) ?? 0 };
}

/** `GET /followups/interactions`: an interaction with the client it was about. */
export interface ApiRecentInteraction extends ApiInteraction {
  client: Ref & { caseNumber?: string };
}

export interface RecentInteraction extends Interaction {
  clientName: string;
}

export function mapRecentInteraction(i: ApiRecentInteraction): RecentInteraction {
  return { ...mapInteraction(i, i.client.id), clientName: i.client.name };
}
