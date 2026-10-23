import { Injectable } from "@nestjs/common";
import { Prisma, type RefreshToken } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

const sessionUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  clientProfile: { select: { caseNumber: true, csrId: true, businessName: true, formationState: true } },
} satisfies Prisma.UserSelect;

export type SessionUserRecord = Prisma.UserGetPayload<{ select: typeof sessionUserSelect }>;

const invitationInclude = {
  user: { select: { id: true, email: true, name: true, role: true, status: true, invitedBy: { select: { name: true } }, clientProfile: { select: { caseNumber: true, csrId: true } } } },
} satisfies Prisma.InvitationTokenInclude;

export type InvitationRecord = Prisma.InvitationTokenGetPayload<{ include: typeof invitationInclude }>;

/** All database access for authentication. Services hold the rules; this holds the queries. */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  findUserWithHash(id: string) {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  updatePassword(id: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
  }

  /** End every session of a user except one family (the caller's). Without a family, ends all of them. */
  async revokeOtherFamilies(userId: string, keepFamilyId: string | undefined): Promise<number> {
    const scope = { userId, revokedAt: null, ...(keepFamilyId ? { familyId: { not: keepFamilyId } } : {}) };
    const families = await this.prisma.refreshToken.findMany({ where: scope, select: { familyId: true }, distinct: ["familyId"] });
    await this.prisma.refreshToken.updateMany({ where: scope, data: { revokedAt: new Date() } });
    return families.length;
  }

  findSessionUser(id: string): Promise<SessionUserRecord | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: sessionUserSelect });
  }

  /** Atomic increment, so parallel failed attempts can't undercount. */
  async incrementFailedLogins(id: string): Promise<number> {
    const user = await this.prisma.user.update({ where: { id }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
    return user.failedLoginCount;
  }

  lockUser(id: string, until: Date) {
    return this.prisma.user.update({ where: { id }, data: { lockedUntil: until, failedLoginCount: 0 } });
  }

  recordSuccessfulLogin(id: string) {
    return this.prisma.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  }

  createRefreshToken(data: Prisma.RefreshTokenUncheckedCreateInput): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Rotate a refresh token in one transaction: retire the old one and issue its replacement in the same family.
   * Returns false if another request already used the old token (a race, treated like reuse).
   */
  async rotateRefreshToken(oldToken: RefreshToken, next: Prisma.RefreshTokenUncheckedCreateInput): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const retired = await tx.refreshToken.updateMany({
        where: { id: oldToken.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: next.id },
      });
      if (retired.count !== 1) return false;
      await tx.refreshToken.create({ data: next });
      return true;
    });
  }

  async revokeFamily(familyId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    return result.count;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return result.count;
  }

  findInvitation(tokenHash: string): Promise<InvitationRecord | null> {
    return this.prisma.invitationToken.findUnique({ where: { tokenHash }, include: invitationInclude });
  }

  /**
   * Set the password, activate the account and burn the invitation in one transaction.
   * Returns false when the invitation was already used by a concurrent request.
   */
  async acceptInvitation(invitationId: string, userId: string, passwordHash: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const used = await tx.invitationToken.updateMany({ where: { id: invitationId, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) return false;
      await tx.user.update({ where: { id: userId }, data: { passwordHash, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null } });
      await tx.clientProfile.updateMany({ where: { userId, joinedAt: null }, data: { joinedAt: new Date() } });
      return true;
    });
  }

  /**
   * Issue a new invitation for a user, retiring any earlier unused ones. Inside the caller's transaction when one is
   * given (so a failed invite leaves no token behind), otherwise in its own.
   */
  async createInvitation(userId: string, tokenHash: string, expiresAt: Date, tx?: Prisma.TransactionClient) {
    const run = async (db: Prisma.TransactionClient) => {
      await db.invitationToken.updateMany({ where: { userId, usedAt: null }, data: { expiresAt: new Date() } });
      return db.invitationToken.create({ data: { userId, tokenHash, expiresAt } });
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  notifyUser(userId: string, text: string, link: string) {
    return this.prisma.notification.create({ data: { userId, text, link } });
  }
}
