import type { Role as PrismaRole } from "@prisma/client";

import type { Role } from "./permissions";

/**
 * The permission table declares its own Role type so it can be loaded without Prisma (permissions.ts imports nothing). These two assertions fail
 * to COMPILE, in `tsc` and in `nest build`, when the Role enum in schema.prisma and that type are not exactly the same set, in either direction:
 * add a role to the schema and the build stops until the permission table is updated. Types only, so nothing is emitted for them to run.
 */
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const roleParity: { prismaRolesAllKnownHere: Exactly<PrismaRole, Role>; localRolesAllInPrisma: Exactly<Role, PrismaRole> } = {
  prismaRolesAllKnownHere: true,
  localRolesAllInPrisma: true,
};
