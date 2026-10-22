import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../prisma/prisma.service";

const select = { name: true, casePrefix: true, logo: true, updatedAt: true } as const;
export type CompanyRecord = { name: string; casePrefix: string; logo: string; updatedAt: Date };

@Injectable()
export class CompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(): Promise<CompanyRecord | null> {
    return this.prisma.company.findUnique({ where: { id: 1 }, select });
  }

  update(data: Partial<Pick<CompanyRecord, "name" | "casePrefix" | "logo">>): Promise<CompanyRecord> {
    return this.prisma.company.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, name: data.name ?? "Innovexify", casePrefix: data.casePrefix ?? "CASE", logo: data.logo ?? "" },
      select,
    });
  }
}
