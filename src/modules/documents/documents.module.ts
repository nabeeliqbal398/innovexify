import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";

import { uploadModuleOptions } from "../../common/storage/upload-options";
import { DocumentsController } from "./controller/documents.controller";
import { DocumentsRepository } from "./repository/documents.repository";
import { DocumentsService } from "./service/documents.service";

/** Client documents: requests, uploads, review, sharing and permission-checked downloads. */
@Module({
  imports: [MulterModule.registerAsync(uploadModuleOptions)],
  controllers: [DocumentsController],
  providers: [DocumentsRepository, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
