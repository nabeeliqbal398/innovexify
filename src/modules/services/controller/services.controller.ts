import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { CreateServiceDto, UpdateServiceDto } from "../dto/services.dto";
import { ServicesService } from "../service/services.service";

@ApiTags("services")
@ApiBearerAuth()
@Controller("services")
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @ApiOperation({ summary: "The service catalog (a client sees only active services)" })
  list(@Req() request: RequestContext) {
    return this.services.list(actorContextOf(request));
  }

  @Get(":id")
  @ApiOperation({ summary: "One service" })
  get(@Param("id") id: string, @Req() request: RequestContext) {
    return this.services.get(actorContextOf(request), id);
  }

  @Post()
  @RequirePermission("manageServices")
  @ApiOperation({ summary: "Add a service (Admin, Manager). Its id is made from the name." })
  async create(@Body() dto: CreateServiceDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.services.create(actorContextOf(request), dto), "Service added.");
  }

  @Patch(":id")
  @RequirePermission("manageServices")
  @ApiOperation({ summary: "Edit a service. Cases already opened for it are not changed." })
  async update(@Param("id") id: string, @Body() dto: UpdateServiceDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.services.update(actorContextOf(request), id, dto), "Service saved.");
  }

  @Post(":id/deactivate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("manageServices")
  @ApiOperation({ summary: "Switch a service off: clients stop seeing it; existing cases keep it" })
  async deactivate(@Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.services.setActive(actorContextOf(request), id, false), "Service switched off. Existing cases for it are unchanged.");
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("manageServices")
  @ApiOperation({ summary: "Switch a service back on" })
  async reactivate(@Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.services.setActive(actorContextOf(request), id, true), "Service switched on.");
  }
}
