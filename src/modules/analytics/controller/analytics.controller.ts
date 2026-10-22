import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { AnalyticsQueryDto } from "../dto/analytics.dto";
import { AnalyticsService } from "../service/analytics.service";

@ApiTags("analytics")
@ApiBearerAuth()
@RequirePermission("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: "Reports & analytics for a date range of at most 24 months (Admin, Manager). Cached for about a minute." })
  get(@Query() query: AnalyticsQueryDto, @Req() request: RequestContext) {
    return this.analytics.get(actorContextOf(request), query);
  }
}
