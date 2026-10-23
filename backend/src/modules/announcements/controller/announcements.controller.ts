import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { CreateAnnouncementDto, ListAnnouncementsQueryDto, UpdateAnnouncementDto } from "../dto/announcements.dto";
import { AnnouncementsService } from "../service/announcements.service";

@ApiTags("announcements")
@ApiBearerAuth()
@Controller("announcements")
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: "Staff: every announcement (filter by status, audience, priority). A client: only published, unexpired ones for them." })
  list(@Query() query: ListAnnouncementsQueryDto, @Req() request: RequestContext) {
    return this.announcements.list(actorContextOf(request), query);
  }

  @Get(":id")
  @ApiOperation({ summary: "One announcement the caller may see" })
  get(@Param("id") id: string, @Req() request: RequestContext) {
    return this.announcements.get(actorContextOf(request), id);
  }

  @Post()
  @RequirePermission("announce")
  @ApiOperation({ summary: "Save a draft, or publish at once with `publish: true` (Admin, Manager, Compliance)" })
  async create(@Body() dto: CreateAnnouncementDto, @Req() request: RequestContext) {
    const created = await this.announcements.create(actorContextOf(request), dto);
    return ApiResponse.of(created, created.status === "PUBLISHED" ? "Published. In-app notifications were created." : "Draft saved.");
  }

  @Patch(":id")
  @RequirePermission("announce")
  @ApiOperation({ summary: "Edit a draft. A published announcement can only be archived." })
  async update(@Param("id") id: string, @Body() dto: UpdateAnnouncementDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.announcements.update(actorContextOf(request), id, dto), "Draft saved.");
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("announce")
  @ApiOperation({ summary: "Publish a draft: notifies the audience (in-app, plus email per their preferences)" })
  async publish(@Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.announcements.publish(actorContextOf(request), id), "Published. In-app notifications were created.");
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("announce")
  @ApiOperation({ summary: "Archive a published announcement" })
  async archive(@Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.announcements.archive(actorContextOf(request), id), "Archived.");
  }

  @Post(":id/ack")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "A client acknowledges an announcement that asks for it. Safe to repeat." })
  async ack(@Param("id") id: string, @Req() request: RequestContext) {
    const result = await this.announcements.acknowledge(actorContextOf(request), id);
    return ApiResponse.of(result, result.alreadyAcknowledged ? "You had already acknowledged this announcement." : "Acknowledged. Thank you.");
  }

  @Get(":id/acks")
  @RequirePermission("announce")
  @ApiOperation({ summary: "Who has acknowledged and who hasn't (staff)" })
  acks(@Param("id") id: string, @Req() request: RequestContext) {
    return this.announcements.acks(actorContextOf(request), id);
  }
}
