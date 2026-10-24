import { Injectable } from "@nestjs/common";

import { ErrorCode } from "../../../common/constants/error-codes";
import { AppException } from "../../../common/exceptions/app.exception";
import { AppConfig } from "../../../config/app-config";

const WINDOW_MS = 60_000;

export class RefreshRateLimitedException extends AppException {
  constructor(limit: number, waitSeconds: number) {
    super(
      ErrorCode.TOO_MANY_REQUESTS,
      `This session is renewing too quickly: the limit is ${limit} a minute. Wait ${waitSeconds} second${waitSeconds === 1 ? "" : "s"} and try again.`,
      429,
    );
  }
}

/**
 * Limits token renewal per SESSION (the refresh-token family), counted only once a live token has been recognised. Many people behind
 * one address therefore never share this limit; the per-address limit on the route is a much higher ceiling that only a flood reaches.
 * A sliding one-minute window in memory, per API instance (see GO-LIVE.md item 10 for more than one instance).
 */
@Injectable()
export class RefreshLimiter {
  private static readonly hits = new Map<string, number[]>();

  constructor(private readonly config: AppConfig) {}

  /** Counts one renewal for this session, or throws when it is over the limit. */
  consume(familyId: string, now = Date.now()): void {
    const limit = this.config.env.REFRESH_THROTTLE_LIMIT;
    const recent = (RefreshLimiter.hits.get(familyId) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= limit) {
      RefreshLimiter.hits.set(familyId, recent);
      throw new RefreshRateLimitedException(limit, Math.max(1, Math.ceil((WINDOW_MS - (now - (recent[0] ?? now))) / 1000)));
    }
    recent.push(now);
    RefreshLimiter.hits.set(familyId, recent);
    if (RefreshLimiter.hits.size > 10_000) this.prune(now);
  }

  private prune(now: number): void {
    for (const [key, times] of RefreshLimiter.hits) if (times.every((t) => now - t >= WINDOW_MS)) RefreshLimiter.hits.delete(key);
  }

  /** For tests: forget everything. */
  reset(): void {
    RefreshLimiter.hits.clear();
  }
}
