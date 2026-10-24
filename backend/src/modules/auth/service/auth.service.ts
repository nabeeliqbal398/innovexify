import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

import {
  AccountInactiveException,
  AccountLockedException,
  CurrentPasswordIncorrectException,
  PasswordUnchangedException,
  InvalidCredentialsException,
  TokenExpiredException,
  TokenInvalidException,
  TokenReuseDetectedException,
  UnauthenticatedException,
} from "../../../common/exceptions";
import { AuditService } from "../../../common/audit/audit.service";
import { AppConfig } from "../../../config/app-config";
import type { AuthSession, ClientContext, SessionUser } from "../interfaces/auth.interfaces";
import { AuthRepository, type SessionUserRecord } from "../repository/auth.repository";
import { RefreshLimiter } from "./refresh-limiter";
import { TokenService } from "./token.service";

const DAY_MS = 86_400_000;

/**
 * A real Argon2id hash of a throwaway string. Verifying against it when the email is unknown keeps the
 * response time the same as for a wrong password, so the endpoint can't be used to discover accounts.
 */
const DUMMY_HASH = argon2.hash("not-a-real-password", { type: argon2.argon2id });

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly refreshLimiter: RefreshLimiter,
  ) {}

  async login(email: string, password: string, ctx: ClientContext): Promise<AuthSession> {
    const user = await this.repo.findUserByEmail(email);

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await this.record(user.id, user.role, "Refused: sign-in while locked", email, false, ctx);
      throw new AccountLockedException(Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)));
    }

    const hash = user?.passwordHash ?? (await DUMMY_HASH);
    const matches = await argon2.verify(hash, password).catch(() => false);

    if (!user || !user.passwordHash || !matches) {
      if (user) await this.registerFailure(user.id, user.role, email, ctx);
      else await this.record(null, null, "Refused: sign-in with unknown email", email, false, ctx);
      throw new InvalidCredentialsException();
    }
    if (user.status !== "ACTIVE") {
      await this.record(user.id, user.role, "Refused: sign-in on inactive account", email, false, ctx);
      throw new AccountInactiveException(user.status === "SUSPENDED" ? "Suspended" : user.status);
    }

    await this.repo.recordSuccessfulLogin(user.id);
    const session = await this.openSession(user.id, randomUUID(), ctx);
    await this.record(user.id, user.role, "Signed in", email, true, ctx);
    return session;
  }

  /**
   * Exchange a refresh token for a new pair. The old token is retired on use. Presenting a token that was
   * already retired means it leaked or was replayed, so every session in its family is ended.
   */
  async refresh(rawToken: string, ctx: ClientContext): Promise<AuthSession> {
    const stored = await this.repo.findRefreshToken(this.tokens.hash(rawToken));
    if (!stored) throw new TokenInvalidException("refresh");

    if (stored.revokedAt && !stored.replacedById) {
      // Ended by sign-out (or by a family revocation), not rotated: nothing was replayed, the session is just over.
      throw new TokenInvalidException("refresh");
    }
    if (stored.revokedAt) {
      await this.repo.revokeFamily(stored.familyId);
      await this.record(stored.userId, null, "Refresh token reuse detected; all sessions in the family were ended", stored.familyId, false, ctx);
      throw new TokenReuseDetectedException();
    }
    if (stored.expiresAt <= new Date()) {
      await this.repo.revokeFamily(stored.familyId);
      throw new TokenExpiredException();
    }

    // A live token of a known session: limit by session, not by address (many people can share an address).
    this.refreshLimiter.consume(stored.familyId);

    const user = await this.repo.findSessionUser(stored.userId);
    if (!user || user.status !== "ACTIVE") {
      await this.repo.revokeFamily(stored.familyId);
      throw new AccountInactiveException(user?.status === "SUSPENDED" ? "Suspended" : (user?.status ?? "Removed"));
    }

    const nextToken = this.tokens.generateOpaqueToken();
    const nextId = randomUUID();
    const rotated = await this.repo.rotateRefreshToken(stored, {
      id: nextId,
      userId: user.id,
      tokenHash: this.tokens.hash(nextToken),
      familyId: stored.familyId,
      expiresAt: this.refreshExpiry(),
      userAgent: ctx.userAgent?.slice(0, 300),
      ipAddress: ctx.ipAddress,
    });
    if (!rotated) {
      // Another request used this token between our read and write: treat it as reuse.
      await this.repo.revokeFamily(stored.familyId);
      throw new TokenReuseDetectedException();
    }
    return this.buildSession(user, nextToken, stored.familyId);
  }

  /** End the session a refresh token belongs to. Safe to call twice, and with an unknown token. */
  async logout(rawToken: string, ctx: ClientContext): Promise<void> {
    const stored = await this.repo.findRefreshToken(this.tokens.hash(rawToken));
    if (!stored) return;
    await this.repo.revokeFamily(stored.familyId);
    await this.record(stored.userId, null, "Signed out", "", true, ctx);
  }

  async logoutAll(userId: string, ctx: ClientContext): Promise<number> {
    const ended = await this.repo.revokeAllForUser(userId);
    await this.record(userId, null, `Signed out of all devices (${ended} session${ended === 1 ? "" : "s"})`, "", true, ctx);
    return ended;
  }

  /**
   * Change the signed-in user's password. A wrong current password counts toward the sign-in lockout.
   * On success every other session (refresh-token family) is ended; the one making the request stays signed in.
   */
  async changePassword(
    userId: string,
    currentFamilyId: string | undefined,
    currentPassword: string,
    newPassword: string,
    ctx: ClientContext,
  ): Promise<number> {
    const user = await this.repo.findUserWithHash(userId);
    if (!user || !user.passwordHash) throw new UnauthenticatedException();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedException(Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)));
    }
    const matches = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!matches) {
      await this.registerFailure(user.id, user.role, user.email, ctx, "Refused: wrong current password on password change");
      throw new CurrentPasswordIncorrectException();
    }
    if (await argon2.verify(user.passwordHash, newPassword).catch(() => false)) throw new PasswordUnchangedException();

    await this.repo.updatePassword(user.id, await argon2.hash(newPassword, { type: argon2.argon2id }));
    const ended = await this.repo.revokeOtherFamilies(user.id, currentFamilyId);
    await this.record(user.id, user.role, `Password changed; ${ended} other session${ended === 1 ? "" : "s"} ended`, user.email, true, ctx);
    return ended;
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.repo.findSessionUser(userId);
    if (!user) throw new UnauthenticatedException("This account no longer exists. Sign in again.");
    return this.toSessionUser(user);
  }

  /** Start a new session family for a user. Also used after an invitation is accepted. */
  async openSession(userId: string, familyId: string, ctx: ClientContext): Promise<AuthSession> {
    const user = await this.repo.findSessionUser(userId);
    if (!user) throw new UnauthenticatedException();
    const refreshToken = this.tokens.generateOpaqueToken();
    await this.repo.createRefreshToken({
      userId,
      tokenHash: this.tokens.hash(refreshToken),
      familyId,
      expiresAt: this.refreshExpiry(),
      userAgent: ctx.userAgent?.slice(0, 300),
      ipAddress: ctx.ipAddress,
    });
    return this.buildSession(user, refreshToken, familyId);
  }

  private buildSession(user: SessionUserRecord, refreshToken: string, familyId: string): AuthSession {
    const { token, expiresIn } = this.tokens.signAccessToken(user, familyId);
    return { accessToken: token, expiresIn, refreshToken, user: this.toSessionUser(user) };
  }

  private toSessionUser(user: SessionUserRecord): SessionUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, clientProfile: user.clientProfile };
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.env.REFRESH_TTL_DAYS * DAY_MS);
  }

  /** Count a failed sign-in and lock the account for a while after too many in a row. */
  private async registerFailure(
    userId: string,
    role: SessionUserRecord["role"],
    email: string,
    ctx: ClientContext,
    action = "Refused: wrong password",
  ): Promise<void> {
    const failures = await this.repo.incrementFailedLogins(userId);
    await this.record(userId, role, action, email, false, ctx);
    if (failures >= this.config.env.LOGIN_MAX_ATTEMPTS) {
      await this.repo.lockUser(userId, new Date(Date.now() + this.config.env.LOGIN_LOCKOUT_MINUTES * 60_000));
      await this.record(userId, role, `Account locked for ${this.config.env.LOGIN_LOCKOUT_MINUTES} minutes after ${failures} failed sign-ins`, email, false, ctx);
    }
  }

  private record(actorId: string | null, role: SessionUserRecord["role"] | null, action: string, target: string, ok: boolean, ctx: ClientContext): Promise<void> {
    return this.audit.record({ actorId, actorRole: role, action, target, ok, category: "auth", requestId: ctx.requestId, ipAddress: ctx.ipAddress });
  }
}
