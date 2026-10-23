import { Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../config/app-config";
import { FileRejectedByScanException, FileRequiredException, StorageFailedException } from "../exceptions";
import { inspectUpload, type InspectedUpload } from "./file-policy";
import { newStorageKey, StorageService } from "./storage.service";
import { VirusScanner } from "./virus-scanner";

/** The shape of a multer memory-storage file, without depending on multer's global types. */
export interface IncomingFile {
  originalname: string;
  buffer: Buffer;
}

export interface StoredFile extends InspectedUpload {
  storageKey: string;
}

/**
 * The one way a file enters the system: check it, scan it, store it, and keep the database and the disk in step.
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly scanner: VirusScanner,
    private readonly config: AppConfig,
  ) {}

  /** Runs every rule and the scan. Nothing is written. Throws the specific exception for the first problem. */
  async check(file: IncomingFile | undefined): Promise<InspectedUpload> {
    if (!file) throw new FileRequiredException();
    const inspected = inspectUpload({ originalName: file.originalname, data: file.buffer }, this.config.env.MAX_UPLOAD_MB * 1_048_576);
    const result = await this.scanner.scan({ fileName: inspected.fileName, mimeType: inspected.mimeType, data: file.buffer });
    if (!result.clean) throw new FileRejectedByScanException(inspected.fileName, result.reason);
    return inspected;
  }

  /**
   * Validates and stores the file, then runs `record` (the database write that refers to it).
   *
   *   - The file is stored BEFORE the database write, so there is never a database row that points at no file.
   *   - If `record` throws (or the transaction behind it rolls back), the stored file is deleted, so there is never a file
   *     that no row points at. The original error is rethrown.
   *   - If storing fails, `record` never runs and nothing in the database changes.
   */
  async store<T>(file: IncomingFile | undefined, record: (stored: StoredFile) => Promise<T>): Promise<T> {
    const inspected = await this.check(file);
    const storageKey = newStorageKey();
    try {
      await this.storage.put(storageKey, (file as IncomingFile).buffer);
    } catch (error) {
      this.logger.error(`Storing ${storageKey} failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new StorageFailedException();
    }
    try {
      return await record({ ...inspected, storageKey });
    } catch (error) {
      await this.discard(storageKey);
      throw error;
    }
  }

  /** Best effort: a leftover file is logged, never allowed to hide the real error. */
  async discard(storageKey: string | null | undefined): Promise<void> {
    if (!storageKey) return;
    try {
      await this.storage.remove(storageKey);
    } catch (error) {
      this.logger.error(`Could not delete stored file ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
