import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AppConfig } from "../../config/app-config";
import { LocalDiskStorage, StorageObjectMissingError } from "./storage.service";

async function read(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

describe("LocalDiskStorage", () => {
  let dir: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "innovexify-storage-spec-")), "nested", "storage");
    storage = new LocalDiskStorage({ env: { STORAGE_DIR: dir } } as AppConfig);
    await storage.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(path.dirname(path.dirname(dir)), { recursive: true, force: true });
  });

  it("creates the storage folder at startup, including missing parents", async () => {
    expect((await fs.stat(dir)).isDirectory()).toBe(true);
  });

  it("stores and reads back the exact bytes, under a two-letter folder named after the key", async () => {
    const key = randomUUID();
    const data = Buffer.from([0, 1, 2, 3, 250, 251, 252]);
    await storage.put(key, data);
    const stored = await storage.open(key);
    expect(stored.sizeBytes).toBe(data.length);
    expect(Buffer.compare(await read(stored.stream), data)).toBe(0);
    expect(await fs.readdir(path.join(dir, key.slice(0, 2)))).toEqual([key]);
  });

  it("leaves no partial file behind, and refuses to overwrite a key that exists", async () => {
    const key = randomUUID();
    await storage.put(key, Buffer.from("first"));
    await expect(storage.put(key, Buffer.from("second"))).rejects.toThrow();
    expect((await read((await storage.open(key)).stream)).toString()).toBe("first");
    expect(await fs.readdir(path.join(dir, key.slice(0, 2)))).toEqual([key]);
  });

  it("removes a file, and removing one that isn't there is not an error", async () => {
    const key = randomUUID();
    await storage.put(key, Buffer.from("x"));
    await storage.remove(key);
    await expect(storage.open(key)).rejects.toBeInstanceOf(StorageObjectMissingError);
    await expect(storage.remove(key)).resolves.toBeUndefined();
    await expect(storage.remove(randomUUID())).resolves.toBeUndefined();
  });

  it("reports a missing object with its own error", async () => {
    await expect(storage.open(randomUUID())).rejects.toBeInstanceOf(StorageObjectMissingError);
  });

  describe("path traversal", () => {
    const hostile = [
      "../secret",
      "..\\secret",
      "../../etc/passwd",
      "/etc/passwd",
      "C:\\Windows\\win.ini",
      "a/b",
      "",
      " ",
      ".",
      "..",
      "not-a-uuid",
      `${randomUUID()}/../../x`,
      `${randomUUID()}.pdf`,
      `${randomUUID()}\u0000.pdf`,
      `../${randomUUID()}`,
      randomUUID().toUpperCase() + "x",
    ];

    it.each(hostile)("refuses the key %j for every operation, and touches nothing outside the folder", async (key) => {
      expect(() => storage.pathOf(key)).toThrow("Invalid storage key.");
      await expect(storage.put(key, Buffer.from("x"))).rejects.toThrow("Invalid storage key.");
      await expect(storage.open(key)).rejects.toThrow("Invalid storage key.");
      await expect(storage.remove(key)).rejects.toThrow("Invalid storage key.");
    });

    it("keeps every valid key inside the root", () => {
      for (let i = 0; i < 50; i++) {
        const full = storage.pathOf(randomUUID());
        expect(full.startsWith(storage.root + path.sep)).toBe(true);
      }
    });

    it("does not delete a sibling file via a crafted key", async () => {
      const outside = path.join(path.dirname(dir), "precious.txt");
      await fs.writeFile(outside, "keep me");
      await expect(storage.remove("../precious.txt")).rejects.toThrow();
      expect(await fs.readFile(outside, "utf8")).toBe("keep me");
    });
  });
});
