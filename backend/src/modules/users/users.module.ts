import { Module } from "@nestjs/common";

import { UsersController } from "./controller/users.controller";
import { UsersRepository } from "./repository/users.repository";
import { UsersService } from "./service/users.service";

/** Accounts: invitations, edits, suspension and soft removal. Clients are created in the clients module. */
@Module({
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
