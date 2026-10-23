import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { ResourceNotFoundException, ValidationFailedException } from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { safeLink } from "../../../common/notifications/notification-links";
import { assertOneDirection, parseCursor } from "../../../common/pagination/cursor.dto";
import { CursorResponse } from "../../../common/responses/api-response";
import type { ListNotificationsQueryDto, NotificationDto } from "../dto/notifications.dto";
import { NotificationsRepository, type NotificationRecord } from "../repository/notifications.repository";

const toDto = (n: NotificationRecord): NotificationDto => ({
  id: n.id,
  text: n.text,
  // Whatever is stored, only a view name leaves the API: a notification can never carry a URL.
  link: safeLink(n.link),
  read: n.readAt !== null,
  readAt: n.readAt,
  createdAt: n.createdAt,
});

/** A person's own notifications. Ownership is part of every query, so someone else's id is a 404. */
@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}

  /** Newest first, by cursor: `before` reads older ones, `since` reads newer ones (oldest first). */
  async list(c: ActorContext, query: ListNotificationsQueryDto): Promise<CursorResponse<NotificationDto>> {
    assertOneDirection(query);
    const owner: Prisma.NotificationWhereInput = { userId: c.actor.id, ...(query.unread ? { readAt: null } : {}) };
    const cursor = query.before ?? query.since;
    const direction = query.since !== undefined ? "after" : "before";
    const field = query.since !== undefined ? "since" : "before";
    const cmp = direction === "before" ? "lt" : "gt";

    let where: Prisma.NotificationWhereInput = owner;
    if (cursor !== undefined) {
      const parsed = parseCursor(cursor, field);
      if (parsed.kind === "time") {
        where = { ...owner, createdAt: { [cmp]: parsed.at } };
      } else {
        const anchor = await this.repo.findOwn(c.actor.id, parsed.id);
        if (!anchor) throw new ValidationFailedException([{ field, message: `${field} isn't one of your notifications.` }]);
        where = { ...owner, OR: [{ createdAt: { [cmp]: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { [cmp]: anchor.id } }] };
      }
    }
    const found = await this.repo.findMany(where, direction === "after" ? "asc" : "desc", query.limit + 1);
    const hasMore = found.length > query.limit;
    const page = found.slice(0, query.limit);
    // A page is always newest first, whichever way it was read.
    const rows = direction === "after" ? page.reverse() : page;
    return new CursorResponse(rows.map(toDto), { limit: query.limit, hasMore, nextBefore: rows[rows.length - 1]?.id ?? null, newest: rows[0]?.id ?? null });
  }

  async unreadCount(c: ActorContext): Promise<{ unread: number }> {
    return { unread: await this.repo.unreadCount(c.actor.id) };
  }

  /** Idempotent: reading it again keeps the first reading time. */
  async markRead(c: ActorContext, id: string): Promise<NotificationDto> {
    await this.requireOwn(c, id);
    await this.repo.markRead(c.actor.id, id);
    return toDto(await this.requireOwn(c, id));
  }

  async markAllRead(c: ActorContext): Promise<{ updated: number }> {
    return { updated: await this.repo.markAllRead(c.actor.id) };
  }

  async remove(c: ActorContext, id: string): Promise<NotificationDto> {
    const own = await this.requireOwn(c, id);
    if (!(await this.repo.remove(c.actor.id, id))) throw new ResourceNotFoundException("notification", id);
    return toDto(own);
  }

  private async requireOwn(c: ActorContext, id: string): Promise<NotificationRecord> {
    const row = await this.repo.findOwn(c.actor.id, id);
    if (!row) throw new ResourceNotFoundException("notification", id);
    return row;
  }
}
