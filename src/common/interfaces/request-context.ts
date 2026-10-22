import type { Role } from "@prisma/client";
import type { Request } from "express";

/** The signed-in user attached to a request by the auth guard. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
  email: string;
  status: string;
  /** The refresh-token family (session) this access token belongs to. */
  familyId?: string;
}

export interface RequestContext extends Request {
  user?: AuthenticatedUser;
}
