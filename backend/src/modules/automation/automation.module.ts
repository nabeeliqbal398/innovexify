import { Module } from "@nestjs/common";

import { AutomationController } from "./controller/automation.controller";
import { AutomationRepository } from "./repository/automation.repository";
import { AutomationService } from "./service/automation.service";

/** Notification triggers and their email templates. */
@Module({ controllers: [AutomationController], providers: [AutomationRepository, AutomationService] })
export class AutomationModule {}
