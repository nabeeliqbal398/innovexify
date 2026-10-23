import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { LogMailService } from "./mail.service";

describe("LogMailService outbox", () => {
  const original = { file: process.env.MAIL_OUTBOX_FILE, env: process.env.NODE_ENV };
  afterEach(() => {
    if (original.file === undefined) delete process.env.MAIL_OUTBOX_FILE;
    else process.env.MAIL_OUTBOX_FILE = original.file;
    (process.env as Record<string, string | undefined>).NODE_ENV = original.env;
  });

  const message = { to: "a@b.co", subject: "Hi", text: "Open /invite/abc", kind: "invitation" as const };

  it("appends one JSON line per email when MAIL_OUTBOX_FILE is set", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "outbox-")), "out.jsonl");
    process.env.MAIL_OUTBOX_FILE = file;
    const mail = new LogMailService();
    await mail.send(message);
    await mail.send({ ...message, to: "c@d.co" });
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.to)).toEqual(["a@b.co", "c@d.co"]);
    expect(lines[0]).toMatchObject({ kind: "invitation", text: "Open /invite/abc" });
  });

  it("writes nothing in production, or without the setting", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "outbox-")), "out.jsonl");
    process.env.MAIL_OUTBOX_FILE = file;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    await new LogMailService().send(message);
    delete process.env.MAIL_OUTBOX_FILE;
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    await new LogMailService().send(message);
    expect(existsSync(file)).toBe(false);
  });
});
