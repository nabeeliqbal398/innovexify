import { fmtAt } from "@/lib/dates";
import type { Conversation, Message } from "@/types/domain";
import { toMs } from "./common";
import { ROLES, USER_STATUS } from "./enums";

/** `GET /clients/:id/messages`. */
export interface ApiMessage {
  id: string;
  clientId: string;
  text: string;
  sender: { id: string; name: string; role: string };
  mine: boolean;
  attachment: { name: string; mimeType: string | null; sizeBytes: number | null } | null;
  createdAt: string;
}

export function mapMessage(m: ApiMessage): Message {
  const at = toMs(m.createdAt) ?? 0;
  return {
    id: m.id,
    from: m.sender.id,
    fromName: m.sender.name,
    fromRole: ROLES.toLabel(m.sender.role),
    text: m.text,
    time: fmtAt(at),
    at,
    mine: m.mine,
    attachment: m.attachment,
  };
}

/** `GET /conversations`. */
export interface ApiConversation {
  client: { id: string; name: string; status: string; caseNumber: string; businessName: string };
  lastMessage: { id: string; text: string; sender: { id: string; name: string }; hasAttachment: boolean; createdAt: string } | null;
  unread: number;
  writable: boolean;
}

export function mapConversation(c: ApiConversation): Conversation {
  return {
    client: { id: c.client.id, name: c.client.name, status: USER_STATUS.toLabel(c.client.status), caseId: c.client.caseNumber, biz: c.client.businessName },
    last: c.lastMessage
      ? { text: c.lastMessage.text, fromName: c.lastMessage.sender.name, hasAttachment: c.lastMessage.hasAttachment, at: toMs(c.lastMessage.createdAt) ?? 0 }
      : null,
    unread: c.unread,
    writable: c.writable,
  };
}

/** Size as people read it ("1.2 MB"). */
export function fileSizeLabel(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
