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
