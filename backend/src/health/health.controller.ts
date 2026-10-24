import { Controller, Get, ServiceUnavailableException, VERSION_NEUTRAL, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { PinoLogger } from "nestjs-pino";

import { Public, Roles } from "../common/decorators/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";
import { HealthService } from "./health.service";

/**
 * Version-neutral, so /api/health stays put when the API moves from /api/v1 to /api/v2.
 *   GET /api/health         liveness: is the process up and the database answering. Public. Used by the container healthcheck.
 *   GET /api/health/ready   readiness for uptime monitoring: database, storage, mail, scanner. Public, pass or fail only, 503 when not ready.
 *   GET /api/health/detail  the same plus the settings behind it. Admin only.
 */
@ApiTags("health")
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: HealthService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthController.name);
  }

  /** Liveness plus database connectivity. Returns 503 with a clear message when the database is down. */
  @Get()
  @Public()
  @SkipThrottle()
  async check(): Promise<{ status: "ok"; database: "up" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error({ err: error }, "Health check: database query failed");
      throw new ServiceUnavailableException("The database is not reachable right now. Try again in a moment.");
    }
    return { status: "ok", database: "up" };
  }

  /** Not wrapped in the usual envelope, so a monitor can read `status` and the HTTP code alone. Throttled like any public route. */
  @Get("ready")
  @Public()
  async ready(@Res() response: Response): Promise<void> {
    const report = await this.health.readiness();
    response.status(report.status === "ok" ? 200 : 503).json(report);
  }

  @Get("detail")
  @ApiBearerAuth()
  @Roles("ADMIN")
  detail() {
    return this.health.detail();
  }
}
