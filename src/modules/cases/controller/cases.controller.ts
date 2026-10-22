import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { AddNoteDto, CreateCaseDto, EventsQueryDto, ListCasesQueryDto, MoveStageDto, UpdateCaseDto } from "../dto/cases.dto";
import { CasesService } from "../service/cases.service";

@ApiTags("cases")
@ApiBearerAuth()
@Controller("cases")
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  @ApiOperation({ summary: "List the cases you may see (filters, search, sort, pagination). Everything outside your scope is left out." })
  list(@Query() query: ListCasesQueryDto, @Req() request: RequestContext) {
    return this.cases.list(actorContextOf(request), query);
  }

  @Get(":id")
  @ApiOperation({ summary: "One case with its timeline, the notes you may read, filings and a task summary. Outside your scope: 404." })
  get(@Param("id") id: string, @Req() request: RequestContext) {
    return this.cases.get(actorContextOf(request), id);
  }

  @Get(":id/events")
  @ApiOperation({ summary: "The case timeline (a client sees stage changes only)" })
  events(@Param("id") id: string, @Query() query: EventsQueryDto, @Req() request: RequestContext) {
    return this.cases.events(actorContextOf(request), id, query);
  }

  @Post()
  @RequirePermission("editCase")
  @ApiOperation({ summary: "Open a case for an existing client who has none" })
  async create(@Body() dto: CreateCaseDto, @Req() request: RequestContext) {
    const created = await this.cases.create(actorContextOf(request), dto);
    return ApiResponse.of(created, `Case ${created.displayNumber} created for ${created.client.name}.`);
  }

  @Patch(":id")
  @RequirePermission("editCase")
  @ApiOperation({ summary: "Change priority, target date, compliance owner, service or hold/block status. Needs the version you loaded." })
  async update(@Param("id") id: string, @Body() dto: UpdateCaseDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.cases.update(actorContextOf(request), id, dto), "Case updated.");
  }

  @Post(":id/stage")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("complianceMilestones")
  @ApiOperation({ summary: "Move the case to the next stage (or back, with a reason). Needs the version you loaded." })
  async changeStage(@Param("id") id: string, @Body() dto: MoveStageDto, @Req() request: RequestContext) {
    const updated = await this.cases.changeStage(actorContextOf(request), id, dto);
    return ApiResponse.of(updated, `${updated.displayNumber} moved to ${updated.stage}. The client was notified.`);
  }

  @Post(":id/notes")
  @RequirePermission("caseNotes")
  @ApiOperation({ summary: "Add an internal note (STAFF or COMPLIANCE visibility). Completed cases still accept notes." })
  async addNote(@Param("id") id: string, @Body() dto: AddNoteDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.cases.addNote(actorContextOf(request), id, dto), "Internal note added. Clients never see it.");
  }
}
