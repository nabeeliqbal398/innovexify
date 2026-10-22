import { Module } from "@nestjs/common";

import { FollowUpsController, InteractionsController } from "./controller/followups.controller";
import { FollowUpsRepository } from "./repository/followups.repository";
import { FollowUpsService } from "./service/followups.service";

/** A CSR's follow-ups and the interaction timeline they feed. */
@Module({
  controllers: [FollowUpsController, InteractionsController],
  providers: [FollowUpsRepository, FollowUpsService],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
