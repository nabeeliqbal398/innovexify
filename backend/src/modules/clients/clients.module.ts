import { Module } from "@nestjs/common";

import { ClientsController } from "./controller/clients.controller";
import { ClientsRepository } from "./repository/clients.repository";
import { ClientsService } from "./service/clients.service";

/** Clients: their profile, their CSR, and the transaction that invites a new one. */
@Module({
  controllers: [ClientsController],
  providers: [ClientsRepository, ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
