import { applyDecorators } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

/**
 * Stricter limit for sign-in, token and password routes: `AUTH_THROTTLE_LIMIT` requests per minute per client (default 5).
 * Read when each request arrives, so a test run can raise it; keep it at 5 in production.
 */
export const AuthThrottle = (): MethodDecorator & ClassDecorator =>
  applyDecorators(Throttle({ default: { limit: () => Number(process.env.AUTH_THROTTLE_LIMIT) || 5, ttl: 60_000 } }));
