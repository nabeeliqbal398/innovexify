import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

const select = { id: true, name: true, category: true, description: true, requirements: true, stages: true, turnaround: true, fee: true, active: true } satisfies Prisma.ServiceSelect;
export type ServiceRecord = Prisma.ServiceGetPayload<{ select: typeof select }>;

@Injectable()
export class ServicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(onlyActive: boolean): Promise<ServiceRecord[]> {
    return this.prisma.service.findMany({ where: onlyActive ? { active: true } : {}, orderBy: [{ category: "asc" }, { name: "asc" }], select });
  }

  /** Unfinished, not removed cases per service id. */
  async activeCaseCounts(): Promise<Map<string, number>> {
    const rows = await this.prisma.case.groupBy({
      by: ["serviceId"],
      where: { deletedAt: null, NOT: { OR: [{ stage: "COMPLETED" }, { status: "COMPLETED" }] } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.serviceId, r._count._all]));
  }

  find(id: string): Promise<ServiceRecord | null> {
    return this.prisma.service.findUnique({ where: { id }, select });
  }

  exists(id: string): Promise<boolean> {
    return this.prisma.service.count({ where: { id } }).then((n) => n > 0);
  }

  create(data: Prisma.ServiceUncheckedCreateInput): Promise<ServiceRecord> {
    return this.prisma.service.create({ data, select });
  }

  update(id: string, data: Prisma.ServiceUpdateInput): Promise<ServiceRecord> {
    return this.prisma.service.update({ where: { id }, data, select });
  }
}
