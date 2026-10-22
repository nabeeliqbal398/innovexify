import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { AppConfig } from "../../config/app-config";
import { DocumentsController } from "./controller/documents.controller";
import { DocumentsRepository } from "./repository/documents.repository";
import { DocumentsService } from "./service/documents.service";

/** Client documents: requests, uploads, review, sharing and permission-checked downloads. */
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        // Held in memory just long enough to check it; UploadService writes it to storage under a random key.
        storage: memoryStorage(),
        // Multer treats a file that reaches the limit as too big, so the limit is one byte over the maximum: a file of exactly
        // MAX_UPLOAD_MB is accepted and one byte more is refused. UploadService checks the exact size again.
        limits: { fileSize: config.env.MAX_UPLOAD_MB * 1_048_576 + 1, files: 1, fields: 10, parts: 12 },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsRepository, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
