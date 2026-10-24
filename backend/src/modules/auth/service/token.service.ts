import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { JwtService, TokenExpiredError } from "@nestjs/jwt";
import type { Role } from "@prisma/client";

import { TokenExpiredException, TokenInvalidException } from "../../../common/exceptions";
import { AppConfig } from "../../../config/app-config";
import type { AccessTokenPayload } from "../interfaces/auth.interfaces";

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  /** Short-lived signed token that proves who is calling. */
  signAccessToken(user: { id: string; role: Role }, familyId: string): { token: string; expiresIn: number } {
    const expiresIn = this.config.env.JWT_ACCESS_TTL_SECONDS;
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, fam: familyId };
    return { token: this.jwt.sign(payload, { expiresIn }), expiresIn };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, { algorithms: ["HS256"] });
    } catch (error) {
      if (error instanceof TokenExpiredError) throw new TokenExpiredException();
      throw new TokenInvalidException();
    }
  }

  /** Random, unguessable token for refresh sessions and invitations. Only its hash is stored. */
  generateOpaqueToken(): string {
    return randomBytes(48).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /** Does this raw token hash to the stored hash? Compared in constant time, so the answer does not leak how many characters matched. */
  matches(rawToken: string, storedHash: string): boolean {
    const given = Buffer.from(this.hash(rawToken), "utf8");
    const stored = Buffer.from(storedHash, "utf8");
    return given.length === stored.length && timingSafeEqual(given, stored);
  }
}
