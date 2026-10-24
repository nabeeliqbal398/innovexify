import { Injectable, Logger } from "@nestjs/common";

import { StorageService } from "../common/storage/storage.service";
import { VirusScanner } from "../common/storage/virus-scanner";
import { AppConfig } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";

export interface CheckResult {
  ok: boolean;
}

/** What uptime monitoring sees: pass or fail per dependency, never a host name, path or error text. */
export interface ReadinessReport {
  status: "ok" | "unavailable";
  checks: {
    database: CheckResult;
    storage: CheckResult;
    mail: CheckResult & { configured: boolean };
    scanner: CheckResult & { enabled: boolean };
  };
  timestamp: string;
}

/** The same checks for an Admin, with the settings behind them (never a password). */
export interface HealthDetail extends ReadinessReport {
  environment: string;
  uptimeSeconds: number;
  mail: { transport: "smtp" | "log"; configured: boolean; host: string | null; port: number | null; from: string | null };
  storage: { kind: string; writable: boolean };
  scanner: { kind: "none" | "clamav"; reachable: boolean | null };
  proxyHops: number | false;
  /**
   * The caller as this server sees them, for checking TRUST_PROXY after a deploy: with the right value, `ip` is YOUR address and changes when you
   * send a different X-Forwarded-For only if a proxy you trust added it.
   */
  client: { ip: string; socketAddress: string; xForwardedFor: string | null; trustProxy: number | false };
  corsOrigins: string[];
}

const CHECK_TIMEOUT_MS = 3000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly scanner: VirusScanner,
    private readonly config: AppConfig,
  ) {}

  /** Mail counts as configured when real delivery is set up (the log transport only writes to the log). */
  get mailConfigured(): boolean {
    return this.config.env.MAIL_TRANSPORT === "smtp";
  }

  async readiness(): Promise<ReadinessReport> {
    const [database, storage, scanner] = await Promise.all([
      this.run("database", async () => void (await this.prisma.$queryRaw`SELECT 1`)),
      this.run("storage", () => this.storage.checkWritable()),
      this.scannerCheck(),
    ]);
    // The log transport is a development tool: it is not a failure there, and production cannot start with it.
    const mail = { ok: this.mailConfigured || !this.config.isProduction, configured: this.mailConfigured };
    const ok = database && storage && mail.ok && scanner.ok;
    return {
      status: ok ? "ok" : "unavailable",
      checks: { database: { ok: database }, storage: { ok: storage }, mail, scanner },
      timestamp: new Date().toISOString(),
    };
  }

  async detail(caller: { ip?: string; socketAddress?: string; xForwardedFor?: string | string[] }): Promise<HealthDetail> {
    const report = await this.readiness();
    const { env } = this.config;
    return {
      ...report,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      mail: { transport: env.MAIL_TRANSPORT, configured: this.mailConfigured, host: env.SMTP_HOST ?? null, port: env.SMTP_PORT ?? null, from: env.MAIL_FROM ?? null },
      storage: { kind: "local-disk", writable: report.checks.storage.ok },
      scanner: { kind: env.VIRUS_SCANNER, reachable: env.VIRUS_SCANNER === "clamav" ? report.checks.scanner.ok : null },
      proxyHops: env.TRUST_PROXY,
      client: {
        ip: caller.ip ?? "unknown",
        socketAddress: caller.socketAddress ?? "unknown",
        xForwardedFor: Array.isArray(caller.xForwardedFor) ? caller.xForwardedFor.join(", ") : (caller.xForwardedFor ?? null),
        trustProxy: env.TRUST_PROXY,
      },
      corsOrigins: env.CORS_ORIGINS,
    };
  }

  private async scannerCheck(): Promise<CheckResult & { enabled: boolean }> {
    const enabled = this.config.env.VIRUS_SCANNER === "clamav";
    if (!enabled || !this.scanner.ping) return { ok: true, enabled };
    const ping = this.scanner.ping.bind(this.scanner);
    return { ok: await this.run("scanner", ping), enabled };
  }

  private async run(name: string, check: () => Promise<unknown>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        check(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS} ms`)), CHECK_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch (error) {
      this.logger.warn(`Readiness check "${name}" failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
