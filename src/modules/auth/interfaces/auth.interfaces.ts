import type { Role } from "@prisma/client";

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  role: Role;
  /** Refresh-token family (session) id, so "every other session" can be ended precisely. */
  fam: string;
}

export interface TokenPair {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Opaque, single-use. Exchange it at /auth/refresh for a new pair. */
  refreshToken: string;
}

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  clientProfile: {
    caseNumber: string;
    csrId: string | null;
    businessName: string;
    formationState: string;
  } | null;
}

export interface AuthSession extends TokenPair {
  user: SessionUser;
}
