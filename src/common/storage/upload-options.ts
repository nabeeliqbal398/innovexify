import type { MulterModuleAsyncOptions } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { AppConfig } from "../../config/app-config";

/**
 * Multer settings shared by every module that accepts a file (documents, message attachments). The file is held in memory
 * just long enough to check it; UploadService then writes it to storage under a random key.
 *
 * Multer treats a file that reaches the limit as too big, so the limit is one byte over the maximum: a file of exactly
 * MAX_UPLOAD_MB is accepted and one byte more is refused. UploadService checks the exact size again.
 */
export const uploadModuleOptions: MulterModuleAsyncOptions = {
  inject: [AppConfig],
  useFactory: (config: AppConfig) => ({
    storage: memoryStorage(),
    limits: { fileSize: config.env.MAX_UPLOAD_MB * 1_048_576 + 1, files: 1, fields: 10, parts: 12 },
  }),
};
