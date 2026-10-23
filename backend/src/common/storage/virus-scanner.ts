import { Injectable } from "@nestjs/common";

export interface ScanRequest {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export type ScanResult = { clean: true } | { clean: false; reason?: string };

/**
 * Called on every file after the content checks and before anything is stored. A real implementation (ClamAV over
 * its socket, a cloud scanning API) replaces NoopScanner in StorageModule; the upload code does not change.
 * A scanner that cannot do its job should throw: the upload is then refused rather than accepted unscanned.
 */
export abstract class VirusScanner {
  abstract scan(request: ScanRequest): Promise<ScanResult>;
}

/** Placeholder: accepts everything. NOT a security control; it only marks where the real scan goes. */
@Injectable()
export class NoopScanner extends VirusScanner {
  scan(): Promise<ScanResult> {
    return Promise.resolve({ clean: true });
  }
}
