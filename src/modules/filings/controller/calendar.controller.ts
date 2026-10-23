import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { CalendarQueryDto } from "../dto/calendar.dto";
import { CalendarService } from "../service/calendar.service";

/** The compliance calendar is for the same people as the filing tracker (`filingTracker`). */
@ApiTags("calendar")
@ApiBearerAuth()
@RequirePermission("filingTracker")
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @ApiOperation({ summary: "Dated work for a range of days: case targets, filing follow-ups, document chases, compliance tasks, illustrative reminders" })
  get(@Query() query: CalendarQueryDto, @Req() request: RequestContext) {
    return this.calendar.get(actorContextOf(request), query);
  }
}
