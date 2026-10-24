import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AppConfig } from "../../config/app-config";
import { AuthController } from "./controller/auth.controller";
import { AuthRepository } from "./repository/auth.repository";
import { AuthService } from "./service/auth.service";
import { InvitationService } from "./service/invitation.service";
import { RefreshLimiter } from "./service/refresh-limiter";
import { PasswordResetService } from "./service/password-reset.service";
import { RefreshCookieService } from "./service/refresh-cookie.service";
import { TokenService } from "./service/token.service";

/**
 * Authentication for the whole API. JwtAuthGuard is global, so every route needs a valid session
 * unless it is marked @Public(); RolesGuard then enforces @Roles(...).
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({ secret: config.env.JWT_ACCESS_SECRET, signOptions: { algorithm: "HS256" } }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    InvitationService,
    PasswordResetService,
    RefreshCookieService,
    RefreshLimiter,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, InvitationService, TokenService],
})
export class AuthModule {}
