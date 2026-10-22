import { SetMetadata } from "@nestjs/common";

import type { RequestContext } from "../interfaces/request-context";
import type { PrismaService } from "../../prisma/prisma.service";
import type { Permission, PermissionResource } from "./permissions";

export const REQUIRE_PERMISSION_KEY = "requirePermission";

/** What a resolver gets: the request, and the database for looking up the record being acted on. */
export interface ResolverContext {
  request: RequestContext;
  prisma: PrismaService;
}

/** Loads the attributes `can()` needs about the target of the request (its owner, assigned CSR, ...). */
export type ResourceResolver = (context: ResolverContext) => PermissionResource | undefined | Promise<PermissionResource | undefined>;

export interface PermissionRequirement {
  permission: Permission;
  resolver?: ResourceResolver;
}

/**
 * Require a permission on a route. The PermissionsGuard runs `can(user, permission, resource)` before the handler.
 * Pass a resolver when the rule depends on the record, such as the client's assigned CSR.
 */
export const RequirePermission = (permission: Permission, resolver?: ResourceResolver): MethodDecorator & ClassDecorator =>
  SetMetadata<string, PermissionRequirement>(REQUIRE_PERMISSION_KEY, { permission, resolver });
