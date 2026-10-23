import { Module } from "@nestjs/common";

import { CasesController } from "./controller/cases.controller";
import { CasesRepository } from "./repository/cases.repository";
import { CasesService } from "./service/cases.service";

/** Formation cases: listing, editing, the stage workflow and internal notes. */
@Module({
  controllers: [CasesController],
  providers: [CasesRepository, CasesService],
  exports: [CasesService],
})
export class CasesModule {}
