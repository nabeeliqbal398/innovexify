import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { AssignTicketDto, ChangeTicketStatusDto, CreateTicketDto, EscalateTicketDto, ListTicketsQueryDto, ReplyTicketDto, ResolveTicketDto, TicketActionDto } from "../dto/tickets.dto";
import { TicketsService } from "../service/tickets.service";

@ApiTags("tickets")
@ApiBearerAuth()
@Controller("tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @ApiOperation({ summary: "List the tickets you may see (a client: their own; a CSR: their clients'; others: all)" })
  list(@Query() query: ListTicketsQueryDto, @Req() request: RequestContext) {
    return this.tickets.list(actorContextOf(request), query);
  }

  @Post()
  @ApiOperation({ summary: "Open a ticket: a client for themselves, or staff on a client's behalf" })
  async create(@Body() dto: CreateTicketDto, @Req() request: RequestContext) {
    const ticket = await this.tickets.create(actorContextOf(request), dto);
    return ApiResponse.of(ticket, `${ticket.displayNumber} opened.`);
  }

  @Get(":id")
  @ApiOperation({ summary: "A ticket with its thread and history. A client never receives internal notes." })
  get(@Param("id") id: string, @Req() request: RequestContext) {
    return this.tickets.get(actorContextOf(request), id);
  }

  @Post(":id/messages")
  @ApiOperation({ summary: "Reply. Staff may set `internal: true` for a note the client never sees. A closed ticket takes no replies." })
  async reply(@Param("id") id: string, @Body() dto: ReplyTicketDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.tickets.reply(actorContextOf(request), id, dto), dto.internal ? "Internal note added. The client never sees it." : "Reply sent.");
  }

  @Post(":id/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change the status (needs the version you loaded). A client can only reopen a resolved ticket, within the window." })
  async status(@Param("id") id: string, @Body() dto: ChangeTicketStatusDto, @Req() request: RequestContext) {
    const ticket = await this.tickets.changeStatus(actorContextOf(request), id, dto);
    return ApiResponse.of(ticket, `${ticket.displayNumber} is now ${ticket.statusLabel}.`);
  }

  @Post(":id/assign")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ticketsStaff")
  @ApiOperation({ summary: "Take the ticket (or, Admin and Manager, hand it to a staff member with `handlerId`)" })
  async assign(@Param("id") id: string, @Body() dto: AssignTicketDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.tickets.assign(actorContextOf(request), id, dto), "Handler updated.");
  }

  @Post(":id/escalate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ticketsStaff")
  @ApiOperation({ summary: "Escalate to Admin and Manager, or remove the escalation with `escalated: false`" })
  async escalate(@Param("id") id: string, @Body() dto: EscalateTicketDto, @Req() request: RequestContext) {
    const ticket = await this.tickets.escalate(actorContextOf(request), id, dto);
    return ApiResponse.of(ticket, ticket.escalated ? `${ticket.displayNumber} escalated. Admin and Manager were notified.` : "Escalation removed.");
  }

  @Post(":id/resolve")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ticketsStaff")
  @ApiOperation({ summary: "Resolve the ticket. `resolutionNote` is required: it is what the client reads." })
  async resolve(@Param("id") id: string, @Body() dto: ResolveTicketDto, @Req() request: RequestContext) {
    const ticket = await this.tickets.resolve(actorContextOf(request), id, dto);
    return ApiResponse.of(ticket, `${ticket.displayNumber} resolved. The client was notified.`);
  }

  @Post(":id/close")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "A client confirms a resolved ticket; staff may also close one" })
  async close(@Param("id") id: string, @Body() dto: TicketActionDto, @Req() request: RequestContext) {
    const ticket = await this.tickets.close(actorContextOf(request), id, dto);
    return ApiResponse.of(ticket, `${ticket.displayNumber} closed.`);
  }
}
