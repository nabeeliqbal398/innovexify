import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

export const notificationSelect = { id: true, userId: true, text: true, link: true, readAt: true, createdAt: true } satisfies Prisma.NotificationSelect;
export type NotificationRecord = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

/** All database access for a person's own notifications. Every query is keyed on the owner. */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(where: Prisma.NotificationWhereInput, order: "asc" | "desc", take: number): Promise<NotificationRecord[]> {
    return this.prisma.notification.findMany({ where, orderBy: [{ createdAt: order }, { id: order }], take, select: notificationSelect });
  }

  /** Always scoped to the owner: someone else's id simply isn't found. */
  findOwn(userId: string, id: string): Promise<NotificationRecord | null> {
    return this.prisma.notification.findFirst({ where: { id, userId }, select: notificationSelect });
  }

  /** Marks one read only if it still isn't, so the first reading time is kept. */
  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<number> {
    return (await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })).count;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return (await this.prisma.notification.deleteMany({ where: { id, userId } })).count === 1;
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }
}
