import { Controller, Get, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { DashboardService } from "../service/dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("nav-counts")
  @ApiOperation({ summary: "The numbers on the navigation items: the work waiting for the caller in each view (unread messages, documents to review, open tickets, ...)" })
  navCounts(@Req() request: RequestContext) {
    return this.dashboard.navCounts(actorContextOf(request));
  }

  @Get("overview")
  @ApiOperation({ summary: "The caller's overview: numbers for their role, counted over the data they may see" })
  overview(@Req() request: RequestContext) {
    return this.dashboard.overview(actorContextOf(request));
  }
}
