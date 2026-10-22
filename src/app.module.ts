import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { PermissionsModule } from "./common/permissions/permissions.guard";
import { AuditModule } from "./common/audit/audit.service";
import { CounterModule } from "./common/counter/counter.service";
import { MailModule } from "./common/mail/mail.service";
import { StorageModule } from "./common/storage/storage.module";
import { RateLimitModule } from "./common/rate-limit/rate-limit.guard";
import { NotificationsModule } from "./common/notifications/notification.service";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";
import { TransformInterceptor } from "./common/responses/transform.interceptor";
import { AppConfig, AppConfigModule } from "./config/app-config";
import { buildLoggerParams } from "./config/logger.config";
import { HealthController } from "./health/health.controller";
import { AccessMatrixModule } from "./modules/access/access.module";
import { AnnouncementsModule } from "./modules/announcements/announcements.module";
import { AuditLogModule } from "./modules/audit/audit-log.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CasesModule } from "./modules/cases/cases.module";
import { AutomationModule } from "./modules/automation/automation.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { CompanyModule } from "./modules/company/company.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { FilingsModule } from "./modules/filings/filings.module";
import { FollowUpsModule } from "./modules/followups/followups.module";
import { MessagesModule } from "./modules/messages/messages.module";
import { UserNotificationsModule } from "./modules/notifications/notifications.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ServicesModule } from "./modules/services/services.module";
import { SearchModule } from "./modules/search/search.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
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
    StorageModule,
    RateLimitModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    CasesModule,
    TasksModule,
    FollowUpsModule,
    DocumentsModule,
    FilingsModule,
    ReportsModule,
    MessagesModule,
    AnnouncementsModule,
    TicketsModule,
    AuditLogModule,
    CompanyModule,
    ServicesModule,
    AutomationModule,
    AccessMatrixModule,
    AnalyticsModule,
    DashboardModule,
    SearchModule,
    UserNotificationsModule,
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
