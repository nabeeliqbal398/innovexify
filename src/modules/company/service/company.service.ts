import { Injectable } from "@nestjs/common";

import { AuditService } from "../../../common/audit/audit.service";
import { PermissionDeniedException, ValidationFailedException } from "../../../common/exceptions";
import { LogoInvalidException } from "../../../common/exceptions/phase4.exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { can, REASON } from "../../../common/permissions/permissions";
import type { CompanyDto, UpdateCompanyDto } from "../dto/company.dto";
import { logoProblem } from "../interfaces/logo";
import { CompanyRepository } from "../repository/company.repository";

/**
 * Company profile. Anyone signed in may read it (the name, logo and prefix are shown in every screen's header).
 * Name and logo need `branding` (Admin); the case prefix needs `operationalSettings` (Admin, Manager). The prefix is
 * stamped on a case ID when the case is created, so changing it never rewrites an existing case number.
 */
@Injectable()
export class CompanyService {
  constructor(
    private readonly repo: CompanyRepository,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<CompanyDto> {
    return (await this.repo.find()) ?? { name: "Innovexify", casePrefix: "CASE", logo: "", updatedAt: new Date(0) };
  }

  async update(c: ActorContext, dto: UpdateCompanyDto): Promise<{ company: CompanyDto; message: string }> {
    const touchesBranding = dto.name !== undefined || dto.logo !== undefined;
    const touchesPrefix = dto.casePrefix !== undefined;
    if (!touchesBranding && !touchesPrefix) throw new ValidationFailedException([{ field: "name", message: "Send at least one of name, casePrefix or logo to change." }]);
    if (touchesBranding && !can(c.actor, "branding")) throw await this.refuse(c, "branding", dto.logo !== undefined ? "the company logo" : "the company name");
    if (touchesPrefix && !can(c.actor, "operationalSettings")) throw await this.refuse(c, "operationalSettings", "the case prefix");

    if (dto.logo) {
      const problem = logoProblem(dto.logo);
      if (problem) throw new LogoInvalidException(problem);
    }
    const before = await this.get();
    const data = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.casePrefix !== undefined ? { casePrefix: dto.casePrefix } : {}),
      ...(dto.logo !== undefined ? { logo: dto.logo } : {}),
    };
    const after = await this.repo.update(data);

    const changes = [
      ...(dto.name !== undefined && dto.name !== before.name ? [`name "${before.name}" to "${dto.name}"`] : []),
      ...(dto.casePrefix !== undefined && dto.casePrefix !== before.casePrefix ? [`case prefix ${before.casePrefix} to ${dto.casePrefix}`] : []),
      ...(dto.logo !== undefined && dto.logo !== before.logo ? [dto.logo ? "logo replaced" : "logo removed"] : []),
    ];
    if (changes.length > 0) {
      await this.audit.record({
        actorId: c.actor.id,
        actorRole: c.actor.role,
        action: `Changed company settings: ${changes.join("; ")}`,
        target: "Company",
        category: "settings",
        requestId: c.requestId,
        ipAddress: c.ipAddress,
      });
    }
    const prefixChanged = dto.casePrefix !== undefined && dto.casePrefix !== before.casePrefix;
    const prefixNote = prefixChanged ? ` Case IDs created from now on start with ${after.casePrefix}; existing case IDs keep their old prefix.` : "";
    return { company: after, message: changes.length > 0 ? `Company settings saved.${prefixNote}` : "Nothing changed." };
  }

  private async refuse(c: ActorContext, permission: "branding" | "operationalSettings", what: string): Promise<PermissionDeniedException> {
    await this.audit.record({
      actorId: c.actor.id,
      actorRole: c.actor.role,
      action: `Refused: tried to change ${what}`,
      target: "Company",
      ok: false,
      category: "settings",
      requestId: c.requestId,
      ipAddress: c.ipAddress,
    });
    return new PermissionDeniedException(REASON[permission]);
  }
}
