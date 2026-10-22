import { Module } from "@nestjs/common";

import { NotificationsController } from "./controller/notifications.controller";
import { NotificationsRepository } from "./repository/notifications.repository";
import { NotificationsService } from "./service/notifications.service";

/** A person's own notifications (the writing side is `common/notifications/NotificationService`). */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationsService],
})
export class UserNotificationsModule {}
