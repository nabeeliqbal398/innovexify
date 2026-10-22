import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";

import { uploadModuleOptions } from "../../common/storage/upload-options";
import { MessagesController } from "./controller/messages.controller";
import { MessagesRepository } from "./repository/messages.repository";
import { MessagesService } from "./service/messages.service";

/** One shared conversation per client: immutable messages, attachments, read markers and unread counts. */
@Module({
  imports: [MulterModule.registerAsync(uploadModuleOptions)],
  controllers: [MessagesController],
  providers: [MessagesRepository, MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
