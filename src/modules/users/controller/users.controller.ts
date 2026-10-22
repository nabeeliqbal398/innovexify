import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser, Roles } from "../../../common/decorators/auth.decorators";
import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { AuthenticatedUser, RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import {
  InviteUserDto,
  ListUsersQueryDto,
  UpdateNotificationPreferencesDto,
  UpdateUserEmailDto,
  UpdateUserNameDto,
  UpdateUserStatusDto,
} from "../dto/users.dto";
import { UsersService } from "../service/users.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles("ADMIN", "MANAGER")
  @ApiOperation({ summary: "List accounts (search, role, status, sort, pagination)" })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  // The "me" routes are declared before ":id" so "me" is never read as an id.
  @Get("me/notification-preferences")
  @ApiOperation({ summary: "Your notification preferences, every category" })
  async myPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.users.notificationPreferences(user.id);
  }

  @Patch("me/notification-preferences")
  @ApiOperation({ summary: "Change email and in-app switches for the categories you list" })
  async updateMyPreferences(@Body() dto: UpdateNotificationPreferencesDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.users.updateNotificationPreferences(actorContextOf(request), dto), "Notification preferences saved.");
  }

  @Get(":id")
  @Roles("ADMIN", "MANAGER")
  @ApiOperation({ summary: "One account" })
  get(@Param("id") id: string) {
    return this.users.get(id);
  }

  @Post()
  @Roles("ADMIN", "MANAGER")
  @ApiOperation({ summary: "Invite a Manager, CSR or Compliance user. Who may invite which role follows the permission table." })
  async invite(@Body() dto: InviteUserDto, @Req() request: RequestContext) {
    const user = await this.users.invite(actorContextOf(request), dto);
    return ApiResponse.of(user, `Invitation sent to ${user.email}.`);
  }

  @Post(":id/resend-invitation")
  @HttpCode(HttpStatus.OK)
  @Roles("ADMIN", "MANAGER", "CSR")
  @ApiOperation({ summary: "Send a fresh invitation link; earlier unused links stop working" })
  async resend(@Param("id") id: string, @Req() request: RequestContext) {
    const user = await this.users.resendInvitation(actorContextOf(request), id);
    return ApiResponse.of(user, `A new invitation was sent to ${user.email}.`);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Change the name. Your own is always allowed; someone else's follows the email rule." })
  async rename(@Param("id") id: string, @Body() dto: UpdateUserNameDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.users.rename(actorContextOf(request), id, dto), "Name updated.");
  }

  @Patch(":id/email")
  @RequirePermission("updateEmail")
  @ApiOperation({ summary: "Change the login email (Admin; Manager except for Admin and other Manager accounts)" })
  async changeEmail(@Param("id") id: string, @Body() dto: UpdateUserEmailDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.users.changeEmail(actorContextOf(request), id, dto), "Email updated.");
  }

  @Patch(":id/status")
  @RequirePermission("suspendUser")
  @ApiOperation({ summary: "Suspend (SUSPENDED) or reactivate (ACTIVE) an account. Suspension ends its sessions at once." })
  async setStatus(@Param("id") id: string, @Body() dto: UpdateUserStatusDto, @Req() request: RequestContext) {
    const user = await this.users.setStatus(actorContextOf(request), id, dto);
    return ApiResponse.of(user, dto.status === "SUSPENDED" ? `${user.name} was suspended. Nothing was deleted.` : `${user.name} was reactivated.`);
  }

  @Delete(":id")
  @RequirePermission("removeUser")
  @ApiOperation({ summary: "Remove an account from the portal (soft delete; every record is kept). Admin only." })
  async remove(@Param("id") id: string, @Req() request: RequestContext) {
    const user = await this.users.remove(actorContextOf(request), id);
    return ApiResponse.of(user, `${user.name} was removed from the portal. Their records are kept.`);
  }
}
