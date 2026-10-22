import { Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PermissionDeniedException } from "../exceptions";
import type { AuthenticatedUser } from "../interfaces/request-context";
import { auditCategoryOf, can, REASON, type Permission, type PermissionResource } from "./permissions";

/**
 * Permission checks for rules that depend on the record being acted on (which role an invitation is for, whose email
 * is being changed). The route-level @RequirePermission decorator covers the coarse "may this role do this at all"
 * check; this does the same `can()` check once the service has loaded the record, and records a refusal in the audit
 * log exactly as the guard does.
 */
@Injectable()
export class AccessService {
  constructor(private readonly audit: AuditService) {}

  can(actor: AuthenticatedUser, permission: Permission, resource?: PermissionResource): boolean {
    return can(actor, permission, resource);
  }

  /** Throws PermissionDeniedException with the rule's own explanation, after writing the refusal to the audit log. */
  async assert(actor: AuthenticatedUser, permission: Permission, resource?: PermissionResource, requestId?: string, target = ""): Promise<void> {
    if (can(actor, permission, resource)) return;
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: `Refused: ${permission}`,
      target,
      ok: false,
      category: auditCategoryOf(permission),
      requestId,
    });
    throw new PermissionDeniedException(REASON[permission] ?? REASON.default);
  }
}
