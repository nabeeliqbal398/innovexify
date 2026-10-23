import { CanActivate, ExecutionContext, Global, Injectable, Module, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AppConfig } from "../../config/app-config";
import { ErrorCode } from "../constants/error-codes";
import { AppException } from "../exceptions/app.exception";
import type { RequestContext } from "../interfaces/request-context";

export type RateLimitName = "messages" | "search";
const KEY = "rateLimit";
const WINDOW_MS = 60_000;

/** Limit this route per signed-in person (not per address): the limit comes from the environment, by name. */
export const RateLimit = (name: RateLimitName): MethodDecorator => SetMetadata(KEY, name);

const WHAT: Record<RateLimitName, string> = { messages: "sending messages", search: "searching" };

export class RateLimitedException extends AppException {
  constructor(name: RateLimitName, limit: number, waitSeconds: number) {
    super(
      ErrorCode.TOO_MANY_REQUESTS,
      `You're ${WHAT[name]} too quickly: the limit is ${limit} per minute. Wait ${waitSeconds} second${waitSeconds === 1 ? "" : "s"} and try again.`,
      429,
    );
  }
}

/**
 * A sliding one-minute window per person and route, kept in memory. Use as `@UseGuards(RateLimitGuard)` with `@RateLimit(name)`;
 * it runs after sign-in, so the person is known. With more than one API instance, swap the Map for a shared store such as Redis
 * (the interface is just "how many hits in the last minute for this key").
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  // Static, so the one window is shared however many times Nest instantiates the guard (once per module that uses it).
  private static readonly hits = new Map<string, number[]>();

  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const name = this.reflector.get<RateLimitName | undefined>(KEY, context.getHandler());
    const user = context.switchToHttp().getRequest<RequestContext>().user;
    if (!name || !user) return true;

    const limit = name === "messages" ? this.config.env.MESSAGE_RATE_LIMIT_PER_MIN : this.config.env.SEARCH_RATE_LIMIT_PER_MIN;
    const now = Date.now();
    const key = `${name}:${user.id}`;
    const recent = (RateLimitGuard.hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= limit) {
      RateLimitGuard.hits.set(key, recent);
      throw new RateLimitedException(name, limit, Math.max(1, Math.ceil((WINDOW_MS - (now - (recent[0] ?? now))) / 1000)));
    }
    recent.push(now);
    RateLimitGuard.hits.set(key, recent);
    return true;
  }

  /** For tests: forget everything. */
  reset(): void {
    RateLimitGuard.hits.clear();
  }
}

@Global()
@Module({ providers: [RateLimitGuard], exports: [RateLimitGuard] })
export class RateLimitModule {}
