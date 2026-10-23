import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { CreateFilingDto, CreateReminderDto, ListFilingsQueryDto, ListRemindersQueryDto, UpdateFilingDto } from "../dto/filings.dto";
import { FilingsService } from "../service/filings.service";

/** The filing tracker is for Compliance, Manager and Admin (`filingTracker`), whichever route reaches it. */
@ApiTags("filings")
@ApiBearerAuth()
@RequirePermission("filingTracker")
@Controller("filings")
export class FilingsController {
  constructor(private readonly filings: FilingsService) {}

  @Get()
  @ApiOperation({ summary: "List filings (status, next-action date range, search, sort), scoped to the cases you can see" })
  list(@Query() query: ListFilingsQueryDto, @Req() request: RequestContext) {
    return this.filings.list(actorContextOf(request), query);
  }

  @Post()
  @ApiOperation({ summary: "Record a filing on a case (manual tracker: nothing is sent to a state system)" })
  async create(@Body() dto: CreateFilingDto, @Req() request: RequestContext) {
    const filing = await this.filings.create(actorContextOf(request), dto);
    return ApiResponse.of(filing, `${filing.displayNumber} recorded (manual record, no state system was contacted).`);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a filing. Status moves forward only, unless an Admin or Manager gives a reason." })
  async update(@Param("id") id: string, @Body() dto: UpdateFilingDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.filings.update(actorContextOf(request), id, dto), "Filing tracker updated (manual record, no state system contacted).");
  }
}

@ApiTags("filings")
@ApiBearerAuth()
@RequirePermission("filingTracker")
@Controller("cases/:caseId")
export class CaseFilingsController {
  constructor(private readonly filings: FilingsService) {}

  @Get("filings")
  @ApiOperation({ summary: "The filings of one case (also on a completed case)" })
  list(@Param("caseId") caseId: string, @Query() query: ListFilingsQueryDto, @Req() request: RequestContext) {
    return this.filings.listForCase(actorContextOf(request), caseId, query);
  }

  @Get("reminders")
  @ApiOperation({ summary: "Illustrative reminders on a case. They are internal working dates, never legal deadlines." })
  reminders(@Param("caseId") caseId: string, @Query() query: ListRemindersQueryDto, @Req() request: RequestContext) {
    return this.filings.listReminders(actorContextOf(request), caseId, query);
  }

  @Post("reminders")
  @ApiOperation({ summary: "Add an illustrative reminder to a case" })
  async addReminder(@Param("caseId") caseId: string, @Body() dto: CreateReminderDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.filings.addReminder(actorContextOf(request), caseId, dto), "Reminder added. It is illustrative: confirm the real date with the state.");
  }

  @Delete("reminders/:id")
  @ApiOperation({ summary: "Remove a reminder" })
  async removeReminder(@Param("caseId") caseId: string, @Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.filings.removeReminder(actorContextOf(request), caseId, id), "Reminder removed.");
  }
}
