import { Injectable } from "@nestjs/common";
import { createConnection } from "node:net";

import { VirusScanner, type ScanRequest, type ScanResult } from "./virus-scanner";

export interface ClamAvOptions {
  host: string;
  port: number;
  /** The whole scan, connection included. A scan that takes longer fails: the upload is refused, never accepted unscanned. */
  timeoutMs: number;
}

const CHUNK = 64 * 1024;

/**
 * Scans a file with a ClamAV daemon (clamd) over TCP, using the INSTREAM command: `zINSTREAM\0`, then the bytes in
 * length-prefixed chunks (4-byte big-endian length), then a zero length. clamd answers `stream: OK`, or
 * `stream: <Signature> FOUND`, or `... ERROR`. Anything that is not a clear OK or FOUND (an error answer, a dropped connection,
 * a timeout) throws, so the upload is refused rather than stored unscanned.
 */
@Injectable()
export class ClamAvScanner extends VirusScanner {
  constructor(private readonly options: ClamAvOptions) {
    super();
  }

  scan(request: ScanRequest): Promise<ScanResult> {
    const { host, port, timeoutMs } = this.options;
    return new Promise<ScanResult>((resolve, reject) => {
      const socket = createConnection({ host, port });
      const reply: Buffer[] = [];
      let settled = false;
      const finish = (error: Error | null, result?: ScanResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(result as ScanResult);
      };
      const timer = setTimeout(() => finish(new Error(`The virus scan did not finish within ${timeoutMs} ms.`)), timeoutMs);

      socket.on("error", (e) => finish(new Error(`The virus scanner could not be reached: ${e.message}`)));
      socket.on("data", (d) => reply.push(d));
      socket.on("end", () => {
        const answer = Buffer.concat(reply).toString("utf8").replace(/\0/g, "").trim();
        if (/\bOK$/.test(answer)) return finish(null, { clean: true });
        const found = /^stream:\s*(.+?)\s+FOUND$/.exec(answer);
        if (found) return finish(null, { clean: false, reason: found[1] });
        return finish(new Error(`The virus scanner gave an answer we cannot trust: ${answer || "(nothing)"}`));
      });
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < request.data.length; offset += CHUNK) {
          const chunk = request.data.subarray(offset, offset + CHUNK);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4)); // a zero length ends the stream
      });
    });
  }
}
