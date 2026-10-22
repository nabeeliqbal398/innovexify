import { Injectable } from "@nestjs/common";

import { AuditService } from "../../../common/audit/audit.service";
import { DuplicateResourceException, ResourceNotFoundException, ValidationFailedException } from "../../../common/exceptions";
import { ServiceStateException } from "../../../common/exceptions/phase4.exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import type { CreateServiceDto, ServiceDto, UpdateServiceDto } from "../dto/services.dto";
import { ServicesRepository, type ServiceRecord } from "../repository/services.repository";

/** "LLC formation" becomes "llc-formation"; the id fits the 32 characters the column holds. */
export const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");

/**
 * The service catalog. Everyone signed in reads it, but a client sees only active services (the ones they can ask for).
 * Admin and Manager (`manageServices`) add and edit services and switch them off and on. Switching a service off hides it
 * from clients' choices; cases already opened for it are not touched.
 */
@Injectable()
export class ServicesService {
  constructor(
    private readonly repo: ServicesRepository,
    private readonly audit: AuditService,
  ) {}

  async list(c: ActorContext): Promise<ServiceDto[]> {
    return this.repo.list(c.actor.role === "CLIENT");
  }

  async get(c: ActorContext, id: string): Promise<ServiceDto> {
    const service = await this.repo.find(id);
    // A client asking for a switched-off service gets the same answer as for one that doesn't exist.
    if (!service || (!service.active && c.actor.role === "CLIENT")) throw new ResourceNotFoundException("service", id);
    return service;
  }

  async create(c: ActorContext, dto: CreateServiceDto): Promise<ServiceDto> {
    const id = slugOf(dto.name);
    if (!id) throw new ValidationFailedException([{ field: "name", message: "The service name needs at least one letter or number." }]);
    if (await this.repo.exists(id)) throw new DuplicateResourceException("service", "name", dto.name);
    const created = await this.repo.create({
      id,
      name: dto.name,
      category: dto.category,
      description: dto.description,
      requirements: dto.requirements ?? [],
      stages: [...new Set(dto.stages)],
      turnaround: dto.turnaround ?? "",
      fee: dto.fee ?? "",
    });
    await this.log(c, `Added service "${created.name}"`, created);
    return created;
  }

  async update(c: ActorContext, id: string, dto: UpdateServiceDto): Promise<ServiceDto> {
    const before = await this.repo.find(id);
    if (!before) throw new ResourceNotFoundException("service", id);
    const data = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.requirements !== undefined ? { requirements: dto.requirements } : {}),
      ...(dto.stages !== undefined ? { stages: [...new Set(dto.stages)] } : {}),
      ...(dto.turnaround !== undefined ? { turnaround: dto.turnaround } : {}),
      ...(dto.fee !== undefined ? { fee: dto.fee } : {}),
    };
    if (Object.keys(data).length === 0) throw new ValidationFailedException([{ field: "name", message: "Send at least one field to change." }]);
    const updated = await this.repo.update(id, data);
    await this.log(c, `Edited service "${updated.name}" (${Object.keys(data).join(", ")})`, updated);
    return updated;
  }

  async setActive(c: ActorContext, id: string, active: boolean): Promise<ServiceDto> {
    const before = await this.repo.find(id);
    if (!before) throw new ResourceNotFoundException("service", id);
    if (before.active === active) throw new ServiceStateException(before.name, active);
    const updated = await this.repo.update(id, { active });
    await this.log(c, active ? `Switched on service "${updated.name}"` : `Switched off service "${updated.name}"`, updated);
    return updated;
  }

  private log(c: ActorContext, action: string, service: ServiceRecord): Promise<void> {
    return this.audit.record({ actorId: c.actor.id, actorRole: c.actor.role, action, target: service.id, category: "settings", requestId: c.requestId, ipAddress: c.ipAddress });
  }
}
