import { Injectable } from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";

import { AppConfig } from "../../../config/app-config";

export const REFRESH_COOKIE = "refresh_token";
/** The cookie is only sent to the auth routes, never to the rest of the API. */
const COOKIE_PATH = "/api/v1/auth";
const DAY_MS = 86_400_000;

/** The refresh token's home: an httpOnly cookie that scripts on the page cannot read. */
@Injectable()
export class RefreshCookieService {
  constructor(private readonly config: AppConfig) {}

  private options(): CookieOptions {
    const { REFRESH_TTL_DAYS, REFRESH_COOKIE_SAMESITE, REFRESH_COOKIE_SECURE } = this.config.env;
    return {
      httpOnly: true,
      // Always Secure in production. SameSite=none is only accepted at startup when the cookie is Secure (env.ts).
      secure: this.config.isProduction || REFRESH_COOKIE_SECURE,
      sameSite: REFRESH_COOKIE_SAMESITE,
      path: COOKIE_PATH,
      maxAge: REFRESH_TTL_DAYS * DAY_MS,
    };
  }

  set(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, this.options());
  }

  clear(response: Response): void {
    const { path, httpOnly, secure, sameSite } = this.options();
    response.clearCookie(REFRESH_COOKIE, { path, httpOnly, secure, sameSite });
  }

  /** Cookie first; a body token only when ALLOW_BODY_REFRESH is on (for non-browser clients and tests). */
  read(request: Request, bodyToken?: string): string | undefined {
    const fromCookie = (request.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (fromCookie) return fromCookie;
    return this.config.env.ALLOW_BODY_REFRESH ? bodyToken : undefined;
  }

  get bodyTokenAllowed(): boolean {
    return this.config.env.ALLOW_BODY_REFRESH;
  }
}
