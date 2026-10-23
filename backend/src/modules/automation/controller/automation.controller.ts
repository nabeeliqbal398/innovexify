import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { UpdateTriggerDto } from "../dto/automation.dto";
import { AutomationService } from "../service/automation.service";

@ApiTags("automation")
@ApiBearerAuth()
@Controller("automation/triggers")
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  @RequirePermission("operationalSettings")
  @ApiOperation({ summary: "The notification triggers: inv, msg, ticket, docreq, sec (Admin, Manager)" })
  list() {
    return this.automation.list();
  }

  @Patch(":key")
  @ApiOperation({ summary: "Switch a trigger's email on or off (Admin, Manager) or choose its template (Admin). The security trigger can't be switched off." })
  async update(@Param("key") key: string, @Body() dto: UpdateTriggerDto, @Req() request: RequestContext) {
    const trigger = await this.automation.update(actorContextOf(request), key, dto);
    return ApiResponse.of(trigger, "Notification settings saved.");
  }
}
