import type { Announcement, AnnouncementAcks } from "@/types/domain";
import { toDay, toMs } from "./common";
import { ANNOUNCEMENT_PRIORITY, ANNOUNCEMENT_STATUS } from "./enums";

/** `GET /announcements`: one shape, a client receives only the first block of fields. */
export interface ApiAnnouncement {
  id: string;
  title: string;
  message: string;
  priority: string;
  publishedAt: string | null;
  expiresAt: string | null;
  requireAck: boolean;
  acknowledged?: boolean;
  acknowledgedAt?: string | null;
  status?: string;
  audience?: { type: "all" } | { type: "client"; id: string; name: string };
  createdBy?: { id: string; name: string };
  createdAt?: string;
  acks?: { acknowledged: number; total: number } | null;
}

export function mapAnnouncement(a: ApiAnnouncement): Announcement {
  return {
    id: a.id,
    title: a.title,
    msg: a.message,
    aud: a.audience?.type === "client" ? a.audience.id : "all",
    audName: a.audience?.type === "client" ? a.audience.name : "All clients",
    prio: ANNOUNCEMENT_PRIORITY.toLabel(a.priority),
    // A client only ever receives published announcements, and the server leaves the status out for them.
    status: a.status ? ANNOUNCEMENT_STATUS.toLabel(a.status) : "Published",
    by: a.createdBy?.id ?? "",
    byName: a.createdBy?.name ?? "Your team",
    ack: a.requireAck,
    acked: Boolean(a.acknowledged),
    acks: a.acks ? { done: a.acks.acknowledged, total: a.acks.total } : null,
    date: toDay(a.publishedAt),
    exp: toDay(a.expiresAt),
  };
}

/** `GET /announcements/:id/acks`. */
export interface ApiAckList {
  announcementId: string;
  acknowledged: number;
  total: number;
  clients: Array<{ id: string; name: string; caseNumber: string; acknowledged: boolean; at: string | null }>;
}

export function mapAckList(l: ApiAckList): AnnouncementAcks {
  return {
    done: l.acknowledged,
    total: l.total,
    clients: l.clients.map((c) => ({ id: c.id, name: c.name, caseId: c.caseNumber, acknowledged: c.acknowledged, at: toMs(c.at) })),
  };
}
