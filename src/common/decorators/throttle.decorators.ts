import { applyDecorators } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

/** Stricter limit for sign-in, token and password routes: 5 requests per minute per client. */
export const AuthThrottle = (): MethodDecorator & ClassDecorator =>
  applyDecorators(Throttle({ default: { limit: 5, ttl: 60_000 } }));
