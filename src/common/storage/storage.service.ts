import { randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { AppConfig } from "../../config/app-config";

export interface StoredObject {
  stream: Readable;
  sizeBytes: number;
}

/** Thrown when a key has no object behind it (never stored, or already removed). */
export class StorageObjectMissingError extends Error {
  constructor(key: string) {
    super(`No stored object for key ${key}.`);
  }
}

/**
 * Where uploaded file bytes live. Services depend on this abstract class, never on a disk or a bucket, so the
 * implementation can change without touching a caller.
 *
 * Keys are chosen by the application (a random UUID, see `newStorageKey`), never derived from a file name.
 * An S3 (or S3-compatible) implementation replaces LocalDiskStorage by implementing these three methods:
 * `put` -> PutObject with the key, `open` -> GetObject (stream) + ContentLength, `remove` -> DeleteObject, then swapping the
 * provider in StorageModule. Downloads still go through the API (permission check, audit, headers), so the bucket stays private.
 */
export abstract class StorageService {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract open(key: string): Promise<StoredObject>;
  /** Deleting a missing key is not an error. */
  abstract remove(key: string): Promise<void>;
}

export const newStorageKey = (): string => randomUUID();

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Files on local disk under STORAGE_DIR, in sub-folders named after the first two characters of the key.
 * Nothing serves this folder: the API streams files itself, after the permission check.
 */
@Injectable()
export class LocalDiskStorage extends StorageService implements OnModuleInit {
  private readonly logger = new Logger(LocalDiskStorage.name);
  readonly root: string;

  constructor(config: AppConfig) {
    super();
    this.root = path.resolve(config.env.STORAGE_DIR);
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    this.logger.log(`File storage ready at ${this.root}`);
  }

  /**
   * Maps a key to a path inside the root, or throws. The key must be exactly a UUID, so "../", absolute paths, separators
   * and anything else are refused before a path is built; the resolved path is then checked to be inside the root as well.
   */
  pathOf(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error("Invalid storage key.");
    const full = path.resolve(this.root, key.slice(0, 2), key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key.");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathOf(key);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    // Write beside the target, then link it into place: a reader never sees half a file, and (unlike rename) a link
    // fails if the key already exists, so a stored file can never be overwritten.
    const temporary = `${target}.${randomUUID()}.part`;
    try {
      await fs.writeFile(temporary, data, { flag: "wx", mode: 0o600 });
      await fs.link(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async open(key: string): Promise<StoredObject> {
    const target = this.pathOf(key);
    try {
      const stat = await fs.stat(target);
      return { stream: createReadStream(target), sizeBytes: stat.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StorageObjectMissingError(key);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.pathOf(key), { force: true });
  }
}
