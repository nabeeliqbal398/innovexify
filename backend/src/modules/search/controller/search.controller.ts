import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RateLimit, RateLimitGuard } from "../../../common/rate-limit/rate-limit.guard";
import { SearchQueryDto } from "../dto/search.dto";
import { SearchService } from "../service/search.service";

@ApiTags("search")
@ApiBearerAuth()
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RateLimit("search")
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: "Search records the caller may see: at most 5 per kind, grouped. 2 to 100 characters. Rate-limited per person." })
  get(@Query() query: SearchQueryDto, @Req() request: RequestContext) {
    return this.search.search(actorContextOf(request), query.q);
  }
}
