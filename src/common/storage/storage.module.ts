import { Global, Module } from "@nestjs/common";

import { LocalDiskStorage, StorageService } from "./storage.service";
import { UploadService } from "./upload.service";
import { NoopScanner, VirusScanner } from "./virus-scanner";

/** File storage and the upload pipeline. Swap `useClass` to move to S3 or a real virus scanner. */
@Global()
@Module({
  providers: [
    { provide: StorageService, useClass: LocalDiskStorage },
    { provide: VirusScanner, useClass: NoopScanner },
    UploadService,
  ],
  exports: [StorageService, VirusScanner, UploadService],
})
export class StorageModule {}
