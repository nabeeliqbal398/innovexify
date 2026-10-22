import { Module } from "@nestjs/common";

import { TasksController } from "./controller/tasks.controller";
import { TasksRepository } from "./repository/tasks.repository";
import { TasksService } from "./service/tasks.service";

/** Tasks on cases: who does what by when, and who has done it. */
@Module({
  controllers: [TasksController],
  providers: [TasksRepository, TasksService],
  exports: [TasksService],
})
export class TasksModule {}
