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

  @Get("overview")
  @ApiOperation({ summary: "The caller's overview: numbers for their role, counted over the data they may see" })
  overview(@Req() request: RequestContext) {
    return this.dashboard.overview(actorContextOf(request));
  }
}
