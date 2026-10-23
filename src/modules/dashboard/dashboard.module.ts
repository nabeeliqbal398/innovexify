import { Module } from "@nestjs/common";

import { AnalyticsModule } from "../analytics/analytics.module";
import { MessagesModule } from "../messages/messages.module";
import { DashboardController } from "./controller/dashboard.controller";
import { DashboardRepository } from "./repository/dashboard.repository";
import { DashboardService } from "./service/dashboard.service";

/** Role-specific overview numbers. */
@Module({ imports: [AnalyticsModule, MessagesModule], controllers: [DashboardController], providers: [DashboardRepository, DashboardService] })
export class DashboardModule {}
