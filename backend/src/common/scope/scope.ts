import type { Prisma, Role } from "@prisma/client";

/**
 * Data scoping. These helpers build the `where` fragment that every list AND every get-by-id query ANDs in, so a
 * record outside the caller's reach is simply not found (404) instead of being found and then refused (403), which
 * would confirm that it exists.
 *
 *   ADMIN, MANAGER   everything
 *   COMPLIANCE       every client and case (viewClients / viewProjects allow it). What Compliance may NOT see, such as
 *                    follow-ups, is decided by the permission table in the module that serves that data.
 *   CSR              only clients assigned to them, and those clients' cases
 *   CLIENT           only their own client record and their own cases
 */

export interface ScopeActor {
  id: string;
  role: Role;
}

/** Matches no row: used for a role this code does not know, so a new role fails closed. */
const MATCH_NOTHING = "__scope_matches_nothing__";

/** Admin and Manager may also open records that were soft-deleted (read-only). */
const seesRemoved = (role: Role): boolean => role === "ADMIN" || role === "MANAGER";

export interface ScopeOptions {
  /** Include soft-deleted records. Honoured for Admin and Manager only. */
  includeRemoved?: boolean;
}

/** Which CLIENT users the actor may see. Combine with `role: "CLIENT"` in the query. */
export function clientScope(actor: ScopeActor, options: ScopeOptions = {}): Prisma.UserWhereInput {
  const visibility: Prisma.UserWhereInput = options.includeRemoved && seesRemoved(actor.role) ? {} : { deletedAt: null };
  return { AND: [visibility, clientRoleScope(actor)] };
}

function clientRoleScope(actor: ScopeActor): Prisma.UserWhereInput {
  switch (actor.role) {
    case "ADMIN":
    case "MANAGER":
    case "COMPLIANCE":
      return {};
    case "CSR":
      return { clientProfile: { is: { csrId: actor.id } } };
    case "CLIENT":
      return { id: actor.id };
    default:
      return { id: MATCH_NOTHING };
  }
}

/** Which cases the actor may see. */
export function caseScope(actor: ScopeActor, options: ScopeOptions = {}): Prisma.CaseWhereInput {
  const visibility: Prisma.CaseWhereInput = options.includeRemoved && seesRemoved(actor.role) ? {} : { deletedAt: null };
  return { AND: [visibility, caseRoleScope(actor)] };
}

function caseRoleScope(actor: ScopeActor): Prisma.CaseWhereInput {
  switch (actor.role) {
    case "ADMIN":
    case "MANAGER":
    case "COMPLIANCE":
      return {};
    case "CSR":
      return { client: { is: { clientProfile: { is: { csrId: actor.id } } } } };
    case "CLIENT":
      return { clientId: actor.id };
    default:
      return { id: MATCH_NOTHING };
  }
}

/**
 * Which tasks the actor may see.
 *   Admin, Manager   every task on a case they can see
 *   CSR              every task on the cases of their own clients
 *   Compliance       tasks assigned to them, created by them, or on a case they own (the prototype's "allTasks" is
 *                    Admin and Manager only, so Compliance does not see the whole list)
 *   Client           only tasks marked for the client, on their own cases
 */
export function taskScope(actor: ScopeActor): Prisma.TaskWhereInput {
  const onVisibleCase: Prisma.TaskWhereInput = { case: { is: caseScope(actor) } };
  switch (actor.role) {
    case "ADMIN":
    case "MANAGER":
    case "CSR":
      return onVisibleCase;
    case "COMPLIANCE":
      return { AND: [onVisibleCase, { OR: [{ assigneeId: actor.id }, { createdById: actor.id }, { case: { is: { ownerId: actor.id } } }] }] };
    case "CLIENT":
      return { AND: [onVisibleCase, { visibility: "CLIENT" }] };
    default:
      return { id: MATCH_NOTHING };
  }
}

/** Which documents the actor may see (a CSR sees them in a list, but the permission table keeps their content from them). */
export function documentScope(actor: ScopeActor, options: ScopeOptions = {}): Prisma.DocumentWhereInput {
  const includeRemoved = Boolean(options.includeRemoved) && seesRemoved(actor.role);
  const visibility: Prisma.DocumentWhereInput = includeRemoved ? {} : { deletedAt: null, client: { is: { deletedAt: null } } };
  return { AND: [visibility, documentRoleScope(actor)] };
}

function documentRoleScope(actor: ScopeActor): Prisma.DocumentWhereInput {
  switch (actor.role) {
    case "ADMIN":
    case "MANAGER":
    case "COMPLIANCE":
      return {};
    case "CSR":
      return { client: { is: { clientProfile: { is: { csrId: actor.id } } } } };
    case "CLIENT":
      return { clientId: actor.id };
    default:
      return { id: MATCH_NOTHING };
  }
}

/** Follow-ups: Admin and Manager see all, a CSR only their own. Nobody else has follow-ups. */
export function followUpScope(actor: ScopeActor): Prisma.FollowUpWhereInput {
  switch (actor.role) {
    case "ADMIN":
    case "MANAGER":
      return {};
    case "CSR":
      return { csrId: actor.id };
    default:
      return { id: MATCH_NOTHING };
  }
}

/** CSR reports to Compliance: a CSR sees their own, Compliance, Manager and Admin see all. A client sees none. */
export function reportScope(actor: ScopeActor): Prisma.ReportWhereInput {
  switch (actor.role) {
    case "ADMIN":
    case "MANAGER":
    case "COMPLIANCE":
      return {};
    case "CSR":
      return { csrId: actor.id };
    default:
      return { id: MATCH_NOTHING };
  }
}

/**
 * Which tickets the actor may see: Admin and Manager every one (including those of removed clients), Compliance every one of an
 * existing client, a CSR those of their own clients (the prototype's `ticketsStaff` rule), a client their own.
 */
export function ticketScope(actor: ScopeActor): Prisma.TicketWhereInput {
  const liveClient: Prisma.TicketWhereInput = actor.role === "ADMIN" || actor.role === "MANAGER" ? {} : { client: { is: { deletedAt: null } } };
  switch (actor.role) {
    case "ADMIN":
    case "MANAGER":
    case "COMPLIANCE":
      return liveClient;
    case "CSR":
      return { AND: [liveClient, { client: { is: { clientProfile: { is: { csrId: actor.id } } } } }] };
    case "CLIENT":
      return { AND: [liveClient, { clientId: actor.id }] };
    default:
      return { id: MATCH_NOTHING };
  }
}
