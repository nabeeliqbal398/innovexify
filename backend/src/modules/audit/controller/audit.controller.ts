import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { AuditFilterDto, ListAuditQueryDto } from "../dto/audit.dto";
import { AuditLogService } from "../service/audit-log.service";

/**
 * The audit log is read-only: two GET routes, and nothing else. There is no route to create, change or delete an entry
 * (a test enumerates the application's routes to keep it that way). Access is the permission table's `auditLog`.
 */
@ApiTags("audit")
@ApiBearerAuth()
@RequirePermission("auditLog")
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: "The audit log, newest first (filters: actorId, category, ok, from, to, search)" })
  list(@Query() query: ListAuditQueryDto) {
    return this.audit.list(query);
  }

  @Get("export")
  @ApiOperation({ summary: "The same entries as a CSV file (at most 50,000 rows; cells that start with = + - @ are prefixed to stop spreadsheet formulas)" })
  async export(@Query() query: AuditFilterDto, @Req() request: RequestContext, @Res({ passthrough: true }) response: Response) {
    const { file, matched, exported, truncated } = await this.audit.export(actorContextOf(request), query);
    response.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "X-Rows-Matched": String(matched),
      "X-Rows-Exported": String(exported),
      "X-Export-Truncated": String(truncated),
    });
    return file;
  }
}
