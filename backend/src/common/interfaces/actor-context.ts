import { UnauthenticatedException } from "../exceptions";
import type { AuthenticatedUser, RequestContext } from "./request-context";

/** Who is doing something, and from which request, for audit entries and error tracing. */
export interface ActorContext {
  actor: AuthenticatedUser;
  requestId?: string;
  ipAddress?: string;
}

/** Builds the context from a request that has passed JwtAuthGuard. */
export function actorContextOf(request: RequestContext): ActorContext {
  if (!request.user) throw new UnauthenticatedException();
  return {
    actor: request.user,
    requestId: request.id === undefined ? undefined : String(request.id),
    ipAddress: request.ip,
  };
}
