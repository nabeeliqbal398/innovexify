import { dISO } from "@/lib/dates";
import { can } from "@/lib/permissions";
import type { DemoData, Ticket, User } from "@/types/domain";

/** Unread messages in one conversation: messages after the user's read marker that someone else wrote. */
export function unreadIn(data: DemoData, me: User, clientId: string): number {
  const thread = data.msgs[clientId] ?? [];
  const read = data.lastRead[me.id]?.[clientId] ?? 0;
  return thread.slice(read).filter((m) => m.from !== me.id).length;
}

/** Tickets a staff user may handle: every ticket, or for a CSR only their own clients'. */
export function staffTickets(data: DemoData, me: User): Ticket[] {
  return data.tickets.filter((t) => {
    const client = data.users.find((u) => u.id === t.client);
    return can(me, "ticketsStaff", { client: t.client, csrOf: client?.csr });
  });
}

/** Number shown on a navigation item: the work waiting for this user in that view. */
export function navCount(view: string, data: DemoData, me: User): number {
  const today = dISO(0);
  switch (view) {
    case "messages":
      return data.users
        .filter((u) => u.role === "CLIENT" && u.status !== "Removed" && can(me, "conversation", u))
        .reduce((sum, c) => sum + unreadIn(data, me, c.id), 0);
    case "documents":
      return data.docs.filter((d) => d.status === "submitted").length;
    case "tickets":
      return staffTickets(data, me).filter((t) => t.status !== "Resolved" && t.status !== "Closed").length;
    case "reports":
      return me.role === "COMPLIANCE"
        ? data.reports.filter((r) => r.status === "Submitted").length
        : 0;
    case "cmsgs":
      return me.role === "CLIENT" ? unreadIn(data, me, me.id) : 0;
    case "followups":
      return data.followups.filter((f) => {
        const client = data.users.find((u) => u.id === f.client);
        return client && can(me, "followups", client) && f.status === "Open" && f.due <= today;
      }).length;
    case "tasks":
      return me.role === "ADMIN" || me.role === "MANAGER"
        ? data.tasks.filter((t) => !t.done && t.due && t.due < today).length
        : 0;
    default:
      return 0;
  }
}
