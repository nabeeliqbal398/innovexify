import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { ApiResponse } from "../../../common/responses/api-response";
import { UpdateCompanyDto } from "../dto/company.dto";
import { CompanyService } from "../service/company.service";

@ApiTags("company")
@ApiBearerAuth()
@Controller("company")
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  @ApiOperation({ summary: "Company name, logo and case prefix (any signed-in user)" })
  get() {
    return this.company.get();
  }

  @Patch()
  @ApiOperation({ summary: "Change the name or logo (Admin) and the case prefix (Admin, Manager)" })
  async update(@Body() dto: UpdateCompanyDto, @Req() request: RequestContext) {
    const { company, message } = await this.company.update(actorContextOf(request), dto);
    return ApiResponse.of(company, message);
  }
}
