import { Injectable } from "@nestjs/common";

import { AuditService } from "../../../common/audit/audit.service";
import { PermissionDeniedException, ResourceNotFoundException, ValidationFailedException } from "../../../common/exceptions";
import { SecurityTriggerRequiredException, TemplateNotAllowedException } from "../../../common/exceptions/phase4.exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { can, REASON } from "../../../common/permissions/permissions";
import type { TriggerDto, UpdateTriggerDto } from "../dto/automation.dto";
import { AutomationRepository } from "../repository/automation.repository";

/**
 * Notification automation: which events send an email, and with which template. A switched-off trigger stops the email only;
 * the in-app notification is still created. Security events can't be switched off. Turning triggers on or off needs
 * `manageTriggers` (Admin, Manager); choosing a template needs `manageTemplates` (Admin).
 * Reading is for staff with either permission: clients and CSRs have no use for it.
 */
@Injectable()
export class AutomationService {
  constructor(
    private readonly repo: AutomationRepository,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<TriggerDto[]> {
    return this.repo.list();
  }

  async update(c: ActorContext, key: string, dto: UpdateTriggerDto): Promise<TriggerDto> {
    if (dto.enabled === undefined && dto.template === undefined) throw new ValidationFailedException([{ field: "enabled", message: "Send enabled, template, or both." }]);
    if (dto.enabled !== undefined && !can(c.actor, "manageTriggers")) throw await this.refuse(c, "manageTriggers", key);
    if (dto.template !== undefined && !can(c.actor, "manageTemplates")) throw await this.refuse(c, "manageTemplates", key);

    const trigger = await this.repo.find(key);
    if (!trigger) throw new ResourceNotFoundException("notification trigger", key);
    if (dto.enabled === false && trigger.security) throw new SecurityTriggerRequiredException(trigger.name);
    if (dto.template !== undefined && !trigger.templateOptions.includes(dto.template)) throw new TemplateNotAllowedException(trigger.name, trigger.templateOptions);

    const changes = [
      ...(dto.enabled !== undefined && dto.enabled !== trigger.enabled ? [dto.enabled ? "switched on" : "switched off"] : []),
      ...(dto.template !== undefined && dto.template !== trigger.template ? [`template ${trigger.template} to ${dto.template}`] : []),
    ];
    if (changes.length === 0) return trigger;
    const updated = await this.repo.update(key, { ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}), ...(dto.template !== undefined ? { template: dto.template } : {}) });
    await this.audit.record({
      actorId: c.actor.id,
      actorRole: c.actor.role,
      action: `Notification "${trigger.name}": ${changes.join("; ")}`,
      target: key,
      category: "settings",
      requestId: c.requestId,
      ipAddress: c.ipAddress,
    });
    return updated;
  }

  private async refuse(c: ActorContext, permission: "manageTriggers" | "manageTemplates", key: string): Promise<PermissionDeniedException> {
    await this.audit.record({
      actorId: c.actor.id,
      actorRole: c.actor.role,
      action: `Refused: tried to change notification "${key}" without permission`,
      target: key,
      ok: false,
      category: "settings",
      requestId: c.requestId,
      ipAddress: c.ipAddress,
    });
    return new PermissionDeniedException(REASON[permission]);
  }
}
