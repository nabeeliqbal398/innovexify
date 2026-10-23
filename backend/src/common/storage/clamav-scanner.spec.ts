import { createServer, type Server } from "node:net";
import type { AddressInfo } from "node:net";

import { ClamAvScanner } from "./clamav-scanner";

/** A stand-in clamd: reads the INSTREAM command and its chunks, then answers with what the test says. */
function fakeClamd(answer: (received: Buffer) => string | null): Promise<{ server: Server; port: number; commands: string[] }> {
  const commands: string[] = [];
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      const parts: Buffer[] = [];
      socket.on("data", (d) => {
        parts.push(d);
        const all = Buffer.concat(parts);
        // Ends when the 4 zero bytes that close the stream have arrived.
        if (all.subarray(all.length - 4).equals(Buffer.alloc(4)) && all.includes("zINSTREAM")) {
          commands.push("zINSTREAM");
          const reply = answer(all);
          if (reply === null) return socket.destroy();
          socket.end(`${reply}\0`);
        }
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port, commands }));
  });
}

const request = { fileName: "a.pdf", mimeType: "application/pdf", data: Buffer.from("hello world") };

describe("ClamAvScanner", () => {
  let fake: Awaited<ReturnType<typeof fakeClamd>> | undefined;
  afterEach(() => {
    fake?.server.close();
    fake = undefined;
  });
  const scanner = (port: number, timeoutMs = 2000) => new ClamAvScanner({ host: "127.0.0.1", port, timeoutMs });

  it("passes a clean file, sending it in length-prefixed chunks", async () => {
    let seen: Buffer = Buffer.alloc(0);
    fake = await fakeClamd((b) => {
      seen = b;
      return "stream: OK";
    });
    await expect(scanner(fake.port).scan(request)).resolves.toEqual({ clean: true });
    expect(seen.subarray(0, 10).toString()).toBe("zINSTREAM\0");
    expect(seen.readUInt32BE(10)).toBe(request.data.length);
    expect(seen.subarray(14, 14 + request.data.length).toString()).toBe("hello world");
  });

  it("reports an infected file with the signature name", async () => {
    fake = await fakeClamd(() => "stream: Eicar-Test-Signature FOUND");
    await expect(scanner(fake.port).scan(request)).resolves.toEqual({ clean: false, reason: "Eicar-Test-Signature" });
  });

  it("refuses (throws) when the scanner answers with an error, drops the connection, or cannot be reached", async () => {
    fake = await fakeClamd(() => "INSTREAM size limit exceeded. ERROR");
    await expect(scanner(fake.port).scan(request)).rejects.toThrow(/cannot trust/);
    fake.server.close();
    fake = await fakeClamd(() => null);
    await expect(scanner(fake.port).scan(request)).rejects.toThrow();
    fake.server.close();
    fake = undefined;
    await expect(scanner(1).scan(request)).rejects.toThrow(/could not be reached/);
  });

  it("gives up after the timeout instead of waiting forever", async () => {
    const hang = createServer(() => undefined);
    await new Promise<void>((r) => hang.listen(0, "127.0.0.1", r));
    await expect(scanner((hang.address() as AddressInfo).port, 300).scan(request)).rejects.toThrow(/did not finish within 300 ms/);
    hang.close();
  });
});
