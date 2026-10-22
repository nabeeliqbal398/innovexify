import { Module } from "@nestjs/common";

import { ReportsController } from "./controller/reports.controller";
import { ReportsRepository } from "./repository/reports.repository";
import { ReportsService } from "./service/reports.service";

/** CSR reports to Compliance: the compliance workflow's inbox. */
@Module({
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
