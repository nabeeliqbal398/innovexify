import { Module } from "@nestjs/common";

import { CalendarController } from "./controller/calendar.controller";
import { CalendarRepository } from "./repository/calendar.repository";
import { CalendarService } from "./service/calendar.service";
import { CaseFilingsController, FilingsController } from "./controller/filings.controller";
import { FilingsRepository } from "./repository/filings.repository";
import { FilingsService } from "./service/filings.service";

/** The manual state-filing tracker and the illustrative reminders on a case. */
@Module({
  controllers: [FilingsController, CaseFilingsController, CalendarController],
  providers: [FilingsRepository, FilingsService, CalendarRepository, CalendarService],
  exports: [FilingsService],
})
export class FilingsModule {}
