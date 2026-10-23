import { Prisma, type Role } from "@prisma/client";

import type { ScopeActor } from "./scope";

/**
 * The same data scoping as `clientScope` / `caseScope`, as SQL, for the aggregate queries (dashboards, analytics, unread
 * counts) that count in the database instead of loading rows. Each function returns a boolean SQL expression to AND into a
 * WHERE clause. They are tested against the Prisma versions, so the two can't drift apart.
 *
 *   ADMIN, MANAGER, COMPLIANCE  every client / case that isn't removed
 *   CSR                         clients assigned to them, and those clients' cases
 *   CLIENT                      themselves and their own cases
 *   anything else               nothing
 */

const NOTHING = Prisma.sql`FALSE`;

const liveClient = (clientIdExpr: Prisma.Sql): Prisma.Sql => Prisma.sql`EXISTS (SELECT 1 FROM "User" su WHERE su.id = ${clientIdExpr} AND su."deletedAt" IS NULL)`;

/**
 * Same rule as `clientScope`: clients that are not removed, and of those the ones this person may see.
 * `clientIdExpr` is a column holding a client's user id, such as `m."clientId"` or `u.id`. Used for the records that belong to a
 * client (messages, tickets, documents, clients themselves), so a removed client's records are left out of the aggregates.
 */
export function clientIdInScope(actor: ScopeActor, clientIdExpr: Prisma.Sql): Prisma.Sql {
  const role: Role = actor.role;
  switch (role) {
    case "ADMIN":
    case "MANAGER":
    case "COMPLIANCE":
      return liveClient(clientIdExpr);
    case "CSR":
      return Prisma.sql`EXISTS (SELECT 1 FROM "User" su JOIN "ClientProfile" scp ON scp."userId" = su.id WHERE su.id = ${clientIdExpr} AND su."deletedAt" IS NULL AND scp."csrId" = ${actor.id})`;
    case "CLIENT":
      return Prisma.sql`${clientIdExpr} = ${actor.id} AND ${liveClient(clientIdExpr)}`;
    default:
      return NOTHING;
  }
}

/**
 * Same rule as `caseScope`: a case that is not removed, belonging to a client the person may see. As in `caseScope`, a case
 * is judged by the case's own `deletedAt` and the client's assignment, not by whether the client user was removed (removing a
 * client removes their cases with them). `caseAlias` is the SQL alias of the "Case" table, such as `c`.
 */
export function caseInScope(actor: ScopeActor, caseAlias: string): Prisma.Sql {
  const alias = Prisma.raw(`"${caseAlias.replace(/[^A-Za-z0-9_]/g, "")}"`);
  const role: Role = actor.role;
  const notRemoved = Prisma.sql`${alias}."deletedAt" IS NULL`;
  switch (role) {
    case "ADMIN":
    case "MANAGER":
    case "COMPLIANCE":
      return notRemoved;
    case "CSR":
      return Prisma.sql`${notRemoved} AND EXISTS (SELECT 1 FROM "ClientProfile" scp WHERE scp."userId" = ${alias}."clientId" AND scp."csrId" = ${actor.id})`;
    case "CLIENT":
      return Prisma.sql`${notRemoved} AND ${alias}."clientId" = ${actor.id}`;
    default:
      return NOTHING;
  }
}

/**
 * `taskAlias` is the alias of the "Task" table and `caseAlias` that of its "Case". Same rules as `taskScope`: Admin, Manager and CSR
 * see the tasks on cases they can see, Compliance only tasks they were given, created or own the case of, a client only
 * tasks marked for them.
 */
export function taskInScope(actor: ScopeActor, taskAlias: string, caseAlias: string): Prisma.Sql {
  const task = Prisma.raw(`"${taskAlias.replace(/[^A-Za-z0-9_]/g, "")}"`);
  const kase = Prisma.raw(`"${caseAlias.replace(/[^A-Za-z0-9_]/g, "")}"`);
  const onVisibleCase = caseInScope(actor, caseAlias);
  switch (actor.role) {
    case "ADMIN":
    case "MANAGER":
    case "CSR":
      return onVisibleCase;
    case "COMPLIANCE":
      return Prisma.sql`${onVisibleCase} AND (${task}."assigneeId" = ${actor.id} OR ${task}."createdById" = ${actor.id} OR ${kase}."ownerId" = ${actor.id})`;
    case "CLIENT":
      return Prisma.sql`${onVisibleCase} AND ${task}.visibility = 'client'::"TaskVisibility"`;
    default:
      return NOTHING;
  }
}
