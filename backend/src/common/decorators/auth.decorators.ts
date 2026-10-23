import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Role } from "@prisma/client";

import type { AuthenticatedUser, RequestContext } from "../interfaces/request-context";

export const IS_PUBLIC_KEY = "isPublic";
export const ROLES_KEY = "roles";

/** Skip authentication for a route (sign-in, invitation lookup, health). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict a route to these roles. Resource rules (own clients, own reports) are checked in services. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

/** The signed-in user, or one property of it. */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<RequestContext>().user;
    return property ? user?.[property] : user;
  },
);
