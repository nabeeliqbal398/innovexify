import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { CurrentUser, Public } from "../../../common/decorators/auth.decorators";
import { AuthEmailThrottle, AuthThrottle, SessionThrottle } from "../../../common/decorators/throttle.decorators";
import { AppException, UnauthenticatedException } from "../../../common/exceptions";
import type { AuthenticatedUser, RequestContext } from "../../../common/interfaces/request-context";
import { ApiResponse } from "../../../common/responses/api-response";
import {
  AcceptInvitationDto,
  AuthSessionDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  InvitationLookupDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  SessionUserDto,
} from "../dto/auth.dto";
import type { AuthSession, ClientContext } from "../interfaces/auth.interfaces";
import { AuthService } from "../service/auth.service";
import { InvitationService } from "../service/invitation.service";
import { FORGOT_PASSWORD_MESSAGE, PasswordResetService } from "../service/password-reset.service";
import { RefreshCookieService } from "../service/refresh-cookie.service";

function contextOf(request: RequestContext): ClientContext {
  return {
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
    requestId: request.id === undefined ? undefined : String(request.id),
  };
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly invitations: InvitationService,
    private readonly passwordReset: PasswordResetService,
    private readonly cookie: RefreshCookieService,
  ) {}

  /**
   * The refresh token goes into the httpOnly cookie. It is added to the JSON body only when
   * ALLOW_BODY_REFRESH=true, so a script running in the page can never read it.
   */
  private present(session: AuthSession, response: Response): Omit<AuthSession, "refreshToken"> & { refreshToken?: string } {
    this.cookie.set(response, session.refreshToken);
    const { refreshToken, ...rest } = session;
    return this.cookie.bodyTokenAllowed ? { ...rest, refreshToken } : rest;
  }

  @Public()
  @AuthEmailThrottle()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign in with email and password. Sets the refresh token as an httpOnly cookie." })
  @ApiOkResponse({ type: AuthSessionDto })
  async login(@Body() dto: LoginDto, @Req() request: RequestContext, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(dto.email, dto.password, contextOf(request));
    return ApiResponse.of(this.present(session, response), "Signed in.");
  }

  @Public()
  @SessionThrottle()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Exchange the refresh cookie for a new token pair (the old one stops working)" })
  @ApiOkResponse({ type: AuthSessionDto })
  async refresh(@Body() dto: RefreshDto, @Req() request: RequestContext, @Res({ passthrough: true }) response: Response) {
    const token = this.cookie.read(request, dto.refreshToken);
    if (!token) throw new UnauthenticatedException("Your session has ended. Sign in again to continue.");
    try {
      const session = await this.auth.refresh(token, contextOf(request));
      return ApiResponse.of(this.present(session, response), "Session refreshed.");
    } catch (error) {
      // A token that failed is dead; don't leave it in the browser.
      if (error instanceof AppException) this.cookie.clear(response);
      throw error;
    }
  }

  @Public()
  @SessionThrottle()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "End this session and clear the cookie" })
  async logout(@Body() dto: RefreshDto, @Req() request: RequestContext, @Res({ passthrough: true }) response: Response) {
    const token = this.cookie.read(request, dto.refreshToken);
    if (token) await this.auth.logout(token, contextOf(request));
    this.cookie.clear(response);
    return ApiResponse.of(null, "Signed out.");
  }

  @ApiBearerAuth()
  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "End every session for the signed-in user, on every device" })
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Req() request: RequestContext, @Res({ passthrough: true }) response: Response) {
    const ended = await this.auth.logoutAll(user.id, contextOf(request));
    this.cookie.clear(response);
    return ApiResponse.of({ sessionsEnded: ended }, "Signed out everywhere.");
  }

  @ApiBearerAuth()
  @AuthThrottle()
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change your password. Every other session is signed out; this one stays signed in." })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthenticatedUser, @Req() request: RequestContext) {
    const ended = await this.auth.changePassword(user.id, user.familyId, dto.currentPassword, dto.newPassword, contextOf(request));
    return ApiResponse.of({ otherSessionsEnded: ended }, "Password changed. Your other sessions were signed out.");
  }

  @ApiBearerAuth()
  @Get("me")
  @ApiOperation({ summary: "The signed-in user" })
  @ApiOkResponse({ type: SessionUserDto })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  @Public()
  @AuthThrottle()
  @Get("invitations/:token")
  @ApiOperation({ summary: "Check an invitation link before choosing a password" })
  @ApiOkResponse({ type: InvitationLookupDto })
  lookupInvitation(@Param("token") token: string) {
    return this.invitations.lookup(token);
  }

  @Public()
  @AuthThrottle()
  @Post("accept-invitation")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set a password from an invitation link; activates the account and signs in" })
  @ApiOkResponse({ type: AuthSessionDto })
  async acceptInvitation(@Body() dto: AcceptInvitationDto, @Req() request: RequestContext, @Res({ passthrough: true }) response: Response) {
    const session = await this.invitations.accept(dto.token, dto.password, contextOf(request));
    return ApiResponse.of(this.present(session, response), "Account created. You're signed in.");
  }

  @Public()
  @AuthEmailThrottle()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Ask for a password reset link. Answers the same way whether or not the account exists." })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: RequestContext) {
    await this.passwordReset.request(dto.email, contextOf(request));
    return ApiResponse.of(null, FORGOT_PASSWORD_MESSAGE);
  }

  @Public()
  @AuthThrottle()
  @Get("reset-password/:token")
  @ApiOperation({ summary: "Check a password reset link before showing the new-password form" })
  lookupPasswordReset(@Param("token") token: string) {
    return this.passwordReset.lookup(token);
  }

  @Public()
  @AuthThrottle()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Choose a new password from a reset link. Ends every session; sign in again afterwards." })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: RequestContext) {
    const { sessionsEnded } = await this.passwordReset.reset(dto.token, dto.password, contextOf(request));
    return ApiResponse.of({ sessionsEnded }, "Password changed. Sign in with your new password.");
  }
}
