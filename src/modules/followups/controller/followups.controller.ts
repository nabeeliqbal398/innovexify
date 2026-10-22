import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import {
  CompleteFollowUpDto,
  CreateFollowUpDto,
  CreateInteractionDto,
  ListFollowUpsQueryDto,
  ListInteractionsQueryDto,
  UpdateFollowUpDto,
} from "../dto/followups.dto";
import { FollowUpsService } from "../service/followups.service";

@ApiTags("follow-ups")
@ApiBearerAuth()
@RequirePermission("followups")
@Controller("followups")
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  @ApiOperation({ summary: "List follow-ups (a CSR sees only their own)" })
  list(@Query() query: ListFollowUpsQueryDto, @Req() request: RequestContext) {
    return this.followUps.list(actorContextOf(request), query);
  }

  @Post()
  @ApiOperation({ summary: "Add a follow-up for one of your clients (Admin and Manager: any client)" })
  async create(@Body() dto: CreateFollowUpDto, @Req() request: RequestContext) {
    const created = await this.followUps.create(actorContextOf(request), dto);
    return ApiResponse.of(created, `Reminder added for ${created.due}.`);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Change type, due date or note of an open follow-up" })
  async update(@Param("id") id: string, @Body() dto: UpdateFollowUpDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.followUps.update(actorContextOf(request), id, dto), "Follow-up saved.");
  }

  @Post(":id/done")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark done with an outcome (1 to 2000 characters); the outcome is also added to the client's timeline" })
  async complete(@Param("id") id: string, @Body() dto: CompleteFollowUpDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.followUps.complete(actorContextOf(request), id, dto), "Follow-up completed and added to the timeline.");
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete an open follow-up" })
  async remove(@Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.followUps.remove(actorContextOf(request), id), "Follow-up deleted.");
  }
}

@ApiTags("follow-ups")
@ApiBearerAuth()
@RequirePermission("followups")
@Controller("clients/:clientId/interactions")
export class InteractionsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  @ApiOperation({ summary: "A client's timeline of calls, emails, messages and meetings (newest first)" })
  list(@Param("clientId") clientId: string, @Query() query: ListInteractionsQueryDto, @Req() request: RequestContext) {
    return this.followUps.listInteractions(actorContextOf(request), clientId, query);
  }

  @Post()
  @ApiOperation({ summary: "Record an interaction with a client" })
  async create(@Param("clientId") clientId: string, @Body() dto: CreateInteractionDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.followUps.addInteraction(actorContextOf(request), clientId, dto), "Interaction recorded.");
  }
}
