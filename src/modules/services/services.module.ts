import { Module } from "@nestjs/common";

import { ServicesController } from "./controller/services.controller";
import { ServicesRepository } from "./repository/services.repository";
import { ServicesService } from "./service/services.service";

/** The service catalog. */
@Module({ controllers: [ServicesController], providers: [ServicesRepository, ServicesService] })
export class ServicesModule {}
