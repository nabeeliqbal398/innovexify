import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { ApiResponse } from "../../../common/responses/api-response";
import { ListNotificationsQueryDto } from "../dto/notifications.dto";
import { NotificationsService } from "../service/notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Your notifications, newest first, by cursor (`unread=true` for unread only)" })
  list(@Query() query: ListNotificationsQueryDto, @Req() request: RequestContext) {
    return this.notifications.list(actorContextOf(request), query);
  }

  // The fixed paths are declared before ":id" so they are never read as ids.
  @Get("unread-count")
  @ApiOperation({ summary: "How many notifications you haven't read" })
  unread(@Req() request: RequestContext) {
    return this.notifications.unreadCount(actorContextOf(request));
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark all of your notifications read" })
  async readAll(@Req() request: RequestContext) {
    return ApiResponse.of(await this.notifications.markAllRead(actorContextOf(request)), "All notifications marked as read.");
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark one of your notifications read (safe to repeat). Someone else's id is a 404." })
  async read(@Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.notifications.markRead(actorContextOf(request), id), "Marked as read.");
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete one of your notifications. Someone else's id is a 404." })
  async remove(@Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.notifications.remove(actorContextOf(request), id), "Notification deleted.");
  }
}
