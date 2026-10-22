import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@prisma/client";

import { ROLES_KEY } from "../decorators/auth.decorators";
import { PermissionDeniedException } from "../exceptions";
import type { RequestContext } from "../interfaces/request-context";

/** Enforces @Roles(...). Runs after JwtAuthGuard, so request.user is set on every protected route. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<RequestContext>().user;
    if (user && required.includes(user.role)) return true;
    throw new PermissionDeniedException("Your role doesn't allow this action.");
  }
}
