import { Controller, Get, ServiceUnavailableException, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { PinoLogger } from "nestjs-pino";

import { Public } from "../common/decorators/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";

/** Version-neutral, so /api/health stays put when the API moves from /api/v1 to /api/v2. */
@ApiTags("health")
@Controller({ path: "health", version: VERSION_NEUTRAL })
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthController.name);
  }

  /** Liveness plus database connectivity. Returns 503 with a clear message when the database is down. */
  @Get()
  async check(): Promise<{ status: "ok"; database: "up" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error({ err: error }, "Health check: database query failed");
      throw new ServiceUnavailableException("The database is not reachable right now. Try again in a moment.");
    }
    return { status: "ok", database: "up" };
  }
}
