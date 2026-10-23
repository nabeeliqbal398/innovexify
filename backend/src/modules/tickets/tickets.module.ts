import { Module } from "@nestjs/common";

import { TicketsController } from "./controller/tickets.controller";
import { TicketsRepository } from "./repository/tickets.repository";
import { TicketsService } from "./service/tickets.service";

/** Client tickets: the status machine, the thread (with internal notes), assignment and escalation. */
@Module({
  controllers: [TicketsController],
  providers: [TicketsRepository, TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
