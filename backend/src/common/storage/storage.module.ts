import { Global, Logger, Module } from "@nestjs/common";

import { AppConfig } from "../../config/app-config";
import { ClamAvScanner } from "./clamav-scanner";
import { LocalDiskStorage, StorageService } from "./storage.service";
import { UploadService } from "./upload.service";
import { NoopScanner, VirusScanner } from "./virus-scanner";

/** File storage and the upload pipeline. The scanner follows VIRUS_SCANNER (none or clamav); swap `StorageService` to move to S3. */
@Global()
@Module({
  providers: [
    { provide: StorageService, useClass: LocalDiskStorage },
    {
      provide: VirusScanner,
      inject: [AppConfig],
      useFactory: (config: AppConfig): VirusScanner => {
        const { VIRUS_SCANNER, CLAMAV_HOST, CLAMAV_PORT, CLAMAV_TIMEOUT_MS } = config.env;
        if (VIRUS_SCANNER === "clamav") return new ClamAvScanner({ host: CLAMAV_HOST, port: CLAMAV_PORT, timeoutMs: CLAMAV_TIMEOUT_MS });
        if (config.isProduction) new Logger("Storage").warn("VIRUS_SCANNER=none: uploaded files are not scanned for malware. See GO-LIVE.md.");
        return new NoopScanner();
      },
    },
    UploadService,
  ],
  exports: [StorageService, VirusScanner, UploadService],
})
export class StorageModule {}
