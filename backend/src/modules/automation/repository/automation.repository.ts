import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

const select = { key: true, name: true, enabled: true, template: true, templateOptions: true, security: true } satisfies Prisma.NotificationTriggerSelect;
export type TriggerRecord = Prisma.NotificationTriggerGetPayload<{ select: typeof select }>;

@Injectable()
export class AutomationRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<TriggerRecord[]> {
    return this.prisma.notificationTrigger.findMany({ orderBy: { key: "asc" }, select });
  }

  find(key: string): Promise<TriggerRecord | null> {
    return this.prisma.notificationTrigger.findUnique({ where: { key }, select });
  }

  update(key: string, data: { enabled?: boolean; template?: string }): Promise<TriggerRecord> {
    return this.prisma.notificationTrigger.update({ where: { key }, data, select });
  }
}
