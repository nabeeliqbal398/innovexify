import { CanActivate, ExecutionContext, Global, Injectable, Module } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";

import { AuditService } from "../audit/audit.service";
import { PermissionDeniedException } from "../exceptions";
import type { RequestContext } from "../interfaces/request-context";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "./access.service";
import { auditCategoryOf, can, REASON } from "./permissions";
import { REQUIRE_PERMISSION_KEY, type PermissionRequirement } from "./require-permission.decorator";

/**
 * Global guard, registered after JwtAuthGuard and RolesGuard. Enforces @RequirePermission(...).
 * A refusal is written to the audit log (ok = false) and answered with the rule's own explanation.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest<RequestContext>();
    const user = request.user;
    const resource = await requirement.resolver?.({ request, prisma: this.prisma });

    if (user && can(user, requirement.permission, resource)) return true;

    await this.audit.record({
      actorId: user?.id,
      actorRole: user?.role,
      action: `Refused: ${requirement.permission} (${request.method} ${request.route?.path ?? request.path})`,
      target: typeof resource?.id === "string" ? resource.id : "",
      ok: false,
      category: auditCategoryOf(requirement.permission),
      requestId: request.id === undefined ? undefined : String(request.id),
      ipAddress: request.ip,
    });
    throw new PermissionDeniedException(REASON[requirement.permission] ?? REASON.default);
  }
}

@Global()
@Module({ providers: [AccessService, { provide: APP_GUARD, useClass: PermissionsGuard }], exports: [AccessService] })
export class PermissionsModule {}
