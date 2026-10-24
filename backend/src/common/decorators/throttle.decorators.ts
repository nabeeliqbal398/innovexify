import { applyDecorators } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

const WINDOW_MS = 60_000;

/** The email a sign-in or reset request is about, written one way so "Ann@X.com" and " ann@x.com" share a bucket. */
export function normaliseEmail(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

/** Who a request counts against: the client address, or (for routes about one mailbox) the address plus that mailbox. */
type Tracked = { ip?: string; body?: unknown };
const addressOf = (req: Tracked): string => req.ip ?? "unknown";
const byAddress = (req: Tracked): string => addressOf(req);
const byAddressAndEmail = (req: Tracked): string => {
  const email = normaliseEmail((req.body as { email?: unknown } | undefined)?.email);
  return email ? `${addressOf(req)}|${email}` : addressOf(req);
};

/**
 * Strict limit for routes that guess secrets: `AUTH_THROTTLE_LIMIT` requests per minute per client address (default 5).
 * Read when each request arrives, so a test run can raise it; keep it at 5 in production.
 */
export const AuthThrottle = (): MethodDecorator & ClassDecorator =>
  applyDecorators(Throttle({ default: { limit: () => Number(process.env.AUTH_THROTTLE_LIMIT) || 5, ttl: WINDOW_MS, getTracker: byAddress } }));

/**
 * Sign-in and password-reset requests: the same strict limit, counted per address AND mailbox. One attacking address can
 * exhaust only its own attempts at one mailbox (not everyone's sign-ins), and an office behind one NAT address does not share
 * one bucket between its people. The account itself is protected separately by the lockout (LOGIN_MAX_ATTEMPTS).
 */
export const AuthEmailThrottle = (): MethodDecorator & ClassDecorator =>
  applyDecorators(Throttle({ default: { limit: () => Number(process.env.AUTH_THROTTLE_LIMIT) || 5, ttl: WINDOW_MS, getTracker: byAddressAndEmail } }));

/**
 * Session upkeep (renewing the access token on every page load, signing out): `REFRESH_IP_CEILING` per minute per client
 * address (default 1200), a backstop only; the real limit is per session (`RefreshLimiter`, `REFRESH_THROTTLE_LIMIT`). Much higher than the sign-in limit because a refresh token is 384 random bits and a
 * reload or a busy office makes many legitimate calls; a flood is still stopped.
 */
export const SessionThrottle = (): MethodDecorator & ClassDecorator =>
  applyDecorators(Throttle({ default: { limit: () => Number(process.env.REFRESH_IP_CEILING) || 1200, ttl: WINDOW_MS, getTracker: byAddress } }));
