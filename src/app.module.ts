import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { PermissionsModule } from "./common/permissions/permissions.guard";
import { AuditModule } from "./common/audit/audit.service";
import { CounterModule } from "./common/counter/counter.service";
import { MailModule } from "./common/mail/mail.service";
import { NotificationsModule } from "./common/notifications/notification.service";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";
import { TransformInterceptor } from "./common/responses/transform.interceptor";
import { AppConfig, AppConfigModule } from "./config/app-config";
import { buildLoggerParams } from "./config/logger.config";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./modules/auth/auth.module";
import { CasesModule } from "./modules/cases/cases.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { UsersModule } from "./modules/users/users.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => buildLoggerParams(config.env),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => [
        { name: "default", ttl: config.env.THROTTLE_TTL_SECONDS * 1000, limit: config.env.THROTTLE_LIMIT },
      ],
    }),
    PrismaModule,
    AuditModule,
    CounterModule,
    MailModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    CasesModule,
    // After AuthModule, so its guard runs after JwtAuthGuard and RolesGuard.
    PermissionsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
