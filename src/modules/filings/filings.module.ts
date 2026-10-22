import { Module } from "@nestjs/common";

import { CaseFilingsController, FilingsController } from "./controller/filings.controller";
import { FilingsRepository } from "./repository/filings.repository";
import { FilingsService } from "./service/filings.service";

/** The manual state-filing tracker and the illustrative reminders on a case. */
@Module({
  controllers: [FilingsController, CaseFilingsController],
  providers: [FilingsRepository, FilingsService],
  exports: [FilingsService],
})
export class FilingsModule {}
