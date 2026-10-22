import { Module } from "@nestjs/common";

import { AnalyticsController } from "./controller/analytics.controller";
import { ANALYTICS_CACHE, InMemoryAnalyticsCache } from "./interfaces/analytics-cache";
import { AnalyticsRepository } from "./repository/analytics.repository";
import { AnalyticsService } from "./service/analytics.service";

/** Reports & analytics. The cache is in memory; provide a Redis implementation under ANALYTICS_CACHE to share it across instances. */
@Module({
  controllers: [AnalyticsController],
  exports: [AnalyticsRepository],
  providers: [AnalyticsRepository, AnalyticsService, { provide: ANALYTICS_CACHE, useFactory: () => new InMemoryAnalyticsCache() }],
})
export class AnalyticsModule {}
