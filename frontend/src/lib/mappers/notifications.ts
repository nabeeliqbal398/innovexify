import { ago } from "@/lib/dates";
import type { AppNotification } from "@/types/domain";
import { toMs } from "./common";

/** `GET /notifications`. `link` is already reduced to a view name (or "") by the server. */
export interface ApiNotification {
  id: string;
  text: string;
  link: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export function mapNotification(n: ApiNotification): AppNotification {
  const at = toMs(n.createdAt);
  return { id: n.id, text: n.text, time: ago(at), unread: !n.read, link: n.link, at };
}
