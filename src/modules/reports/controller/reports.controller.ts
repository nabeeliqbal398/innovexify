import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { CreateReportDto, ListReportsQueryDto, ReportTextDto, SetReportStatusDto } from "../dto/reports.dto";
import { ReportsService } from "../service/reports.service";

/** Reports are internal: staff only (`reportView`). Clients have no access. */
@ApiTags("reports")
@ApiBearerAuth()
@RequirePermission("reportView")
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: "List reports. A CSR sees their own; Compliance, Manager and Admin see all." })
  list(@Query() query: ListReportsQueryDto, @Req() request: RequestContext) {
    return this.reports.list(actorContextOf(request), query);
  }

  @Post()
  @RequirePermission("reportSend")
  @ApiOperation({ summary: "A CSR sends a report to Compliance about one of their own clients" })
  async create(@Body() dto: CreateReportDto, @Req() request: RequestContext) {
    const report = await this.reports.create(actorContextOf(request), dto);
    return ApiResponse.of(report, `${report.displayNumber} sent to Compliance.`);
  }

  @Get(":id")
  @ApiOperation({ summary: "A report with its thread and history (Compliance-only notes are left out for a CSR)" })
  get(@Param("id") id: string, @Req() request: RequestContext) {
    return this.reports.get(actorContextOf(request), id);
  }

  @Post(":id/messages")
  @ApiOperation({ summary: "Reply in the thread. A resolved report accepts no more replies." })
  async reply(@Param("id") id: string, @Body() dto: ReportTextDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.reports.reply(actorContextOf(request), id, dto), "Reply sent.");
  }

  @Post(":id/notes")
  @RequirePermission("reportReview")
  @ApiOperation({ summary: "Add a Compliance-only note (Compliance). Never shown to the CSR." })
  async addNote(@Param("id") id: string, @Body() dto: ReportTextDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.reports.addNote(actorContextOf(request), id, dto), "Note added. The CSR never sees it.");
  }

  @Post(":id/status")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("reportReview")
  @ApiOperation({ summary: "Compliance acknowledges, requests clarification, or resolves (REVIEWED)" })
  async setStatus(@Param("id") id: string, @Body() dto: SetReportStatusDto, @Req() request: RequestContext) {
    const report = await this.reports.setStatus(actorContextOf(request), id, dto);
    return ApiResponse.of(report, `${report.displayNumber} marked ${report.statusLabel.toLowerCase()}.`);
  }
}
