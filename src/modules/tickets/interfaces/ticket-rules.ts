import type { TicketStatus } from "@prisma/client";

/**
 * The ticket status machine. The prototype let staff pick any status in a dropdown, with one hard rule (Resolved needs
 * resolution notes) and client buttons for "reopen" and "confirm resolved". The server states that as a machine:
 *
 *   Open, In Progress, Waiting for Client, Waiting for Internal Team   (the four "active" statuses: staff move freely
 *                                                                        between them, and may resolve or close)
 *   Resolved   -> Open (reopen) or Closed (confirmed)
 *   Closed     -> nothing (final)
 *
 * Pure functions: no database, no clock (the caller passes `now`).
 */

export const TICKET_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_CLIENT: "Waiting for Client",
  WAITING_FOR_INTERNAL_TEAM: "Waiting for Internal Team",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const ACTIVE_STATUSES: readonly TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM"];

/** Statuses only staff may set: they describe who the team is waiting on, which a client has no say in. */
export const STAFF_ONLY_STATUSES: readonly TicketStatus[] = ["IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM"];

export const isActive = (status: TicketStatus): boolean => ACTIVE_STATUSES.includes(status);

const FROM_ACTIVE: Record<"OPEN" | "IN_PROGRESS" | "WAITING_FOR_CLIENT" | "WAITING_FOR_INTERNAL_TEAM", readonly TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM", "RESOLVED", "CLOSED"],
  WAITING_FOR_CLIENT: ["OPEN", "IN_PROGRESS", "WAITING_FOR_INTERNAL_TEAM", "RESOLVED", "CLOSED"],
  WAITING_FOR_INTERNAL_TEAM: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT", "RESOLVED", "CLOSED"],
};

/** Every move the machine allows, for anyone allowed to make a status change at all. */
export const NEXT_STATUS: Record<TicketStatus, readonly TicketStatus[]> = { ...FROM_ACTIVE, RESOLVED: ["OPEN", "CLOSED"], CLOSED: [] };

/** Why a move isn't allowed, in words for the person who tried it. */
export function whyNot(from: TicketStatus, to: TicketStatus): string {
  if (from === to) return "It is already in that status.";
  if (from === "CLOSED") return "A closed ticket is final. Open a new ticket if the problem is back.";
  if (from === "RESOLVED") return "A resolved ticket can only be reopened, or closed once the client has confirmed it.";
  return "That move isn't part of the ticket workflow.";
}

/**
 * A client may reopen a Resolved ticket for `days` days after it was resolved. Staff aren't limited. 0 days means never.
 * A ticket with no recorded resolution time (old data) is treated as inside the window.
 */
export function withinReopenWindow(resolvedAt: Date | null, now: Date, days: number): boolean {
  if (days <= 0) return false;
  if (!resolvedAt) return true;
  return now.getTime() - resolvedAt.getTime() <= days * 86_400_000;
}

/** An event where the status didn't change (an escalation, an assignment) is internal: the client's history leaves it out. */
export const isStatusChange = (event: { fromStatus: TicketStatus | null; toStatus: TicketStatus }): boolean => event.fromStatus !== event.toStatus;
