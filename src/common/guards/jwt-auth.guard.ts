import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "../decorators/auth.decorators";
import { AccountInactiveException, UnauthenticatedException } from "../exceptions";
import type { RequestContext } from "../interfaces/request-context";
import { TokenService } from "../../modules/auth/service/token.service";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Global guard. Verifies the bearer token, then loads the user so a suspended or removed account
 * loses access immediately instead of when its token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestContext>();
    const header = request.headers.authorization;
    const [scheme, token] = header?.split(" ") ?? [];
    if (scheme?.toLowerCase() !== "bearer" || !token) throw new UnauthenticatedException();

    const payload = this.tokens.verifyAccessToken(token);
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, role: true, email: true, status: true },
    });
    if (!user) throw new UnauthenticatedException("This account no longer exists. Sign in again.");
    if (user.status !== "ACTIVE") throw new AccountInactiveException(user.status === "SUSPENDED" ? "Suspended" : user.status);

    request.user = { id: user.id, role: user.role, email: user.email, status: user.status, familyId: payload.fam };
    return true;
  }
}
