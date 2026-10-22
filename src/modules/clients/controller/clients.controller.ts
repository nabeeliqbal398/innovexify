import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { ChangeCsrDto, CreateClientDto, ListClientsQueryDto, UpdateClientProfileDto } from "../dto/clients.dto";
import { ClientsService } from "../service/clients.service";

@ApiTags("clients")
@ApiBearerAuth()
@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermission("viewClients")
  @ApiOperation({ summary: "List the clients you may see (search, status, csrId, state, sort, pagination)" })
  list(@Query() query: ListClientsQueryDto, @Req() request: RequestContext) {
    return this.clients.list(actorContextOf(request), query);
  }

  @Get(":id")
  @RequirePermission("viewClient")
  @ApiOperation({ summary: "One client: profile, assigned CSR and case summary. A client outside your scope is a 404." })
  get(@Param("id") id: string, @Req() request: RequestContext) {
    return this.clients.get(actorContextOf(request), id);
  }

  @Post()
  @RequirePermission("inviteCLIENT")
  @ApiOperation({ summary: "Invite a client: creates the account, the case ID, the first case and the invitation email in one transaction" })
  async create(@Body() dto: CreateClientDto, @Req() request: RequestContext) {
    const client = await this.clients.create(actorContextOf(request), dto);
    return ApiResponse.of(
      client,
      client.invitationEmailSent
        ? `Client invited. The invitation was sent to ${client.email}.`
        : `Client created, but the invitation email to ${client.email} could not be sent. Use "Resend invitation" to try again.`,
    );
  }

  @Patch(":id/profile")
  @ApiOperation({ summary: "Edit the profile. Admin and Manager: every field. A client: their own phone, address, preferred name and contact preference." })
  async updateProfile(@Param("id") id: string, @Body() dto: UpdateClientProfileDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.clients.updateProfile(actorContextOf(request), id, dto), "Profile saved.");
  }

  @Patch(":id/csr")
  @RequirePermission("assignNewClient")
  @ApiOperation({ summary: "Assign a CSR to a client who has none, or reassign one who has (Admin and Manager)" })
  async changeCsr(@Param("id") id: string, @Body() dto: ChangeCsrDto, @Req() request: RequestContext) {
    const client = await this.clients.changeCsr(actorContextOf(request), id, dto);
    return ApiResponse.of(client, `${client.name} is now assigned to ${client.csr?.name ?? "a CSR"}.`);
  }
}
