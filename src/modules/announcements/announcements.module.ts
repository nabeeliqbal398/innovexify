import { Module } from "@nestjs/common";

import { AnnouncementsController } from "./controller/announcements.controller";
import { AnnouncementsRepository } from "./repository/announcements.repository";
import { AnnouncementsService } from "./service/announcements.service";

/** Announcements to all clients or one: drafts, publishing, expiry, acknowledgements. */
@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsRepository, AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
