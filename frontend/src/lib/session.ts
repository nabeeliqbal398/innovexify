import { authApi } from "@/store/api/auth";
import { baseApi } from "@/store/api/base";
import type { AppDispatch } from "@/store";
import { sessionActions } from "@/store/sessionSlice";
import type { ApiError } from "@/types/api";

/** Load who the new access token belongs to and mark the session as started. Throws the ApiError if `/auth/me` fails. */
export async function establishSession(dispatch: AppDispatch, accessToken: string): Promise<void> {
  dispatch(sessionActions.tokenSet(accessToken));
  const me = await dispatch(authApi.endpoints.me.initiate(undefined, { forceRefetch: true }));
  if (me.error || !me.data) throw me.error;
  dispatch(sessionActions.signedIn({ accessToken, user: me.data }));
}

let booting: Promise<void> | null = null;

/**
 * At page load: trade the refresh cookie for an access token, then load the person. No cookie, or a refused one, means nobody
 * is signed in (no message: that is the normal first visit). One run only, however many times it is called (React Strict Mode
 * runs effects twice in development, and a second refresh with the same cookie would look like a replayed token to the server).
 */
export function bootstrapSession(dispatch: AppDispatch): Promise<void> {
  booting ??= (async () => {
    const refreshed = await dispatch(authApi.endpoints.refresh.initiate());
    if (refreshed.error || !refreshed.data) {
      dispatch(sessionActions.ended(null));
      return;
    }
    try {
      await establishSession(dispatch, refreshed.data.accessToken);
    } catch {
      dispatch(sessionActions.ended(null));
    }
  })();
  return booting;
}

/** Tests and sign-out: allow the next page load to bootstrap again. */
export function resetBootstrap(): void {
  booting = null;
}

/** End the session on this device: tell the server (best effort), forget everything held in memory. */
export async function signOut(dispatch: AppDispatch, notice?: string): Promise<void> {
  try {
    await dispatch(authApi.endpoints.logout.initiate()).unwrap();
  } catch {
    // The server may be unreachable; the person still leaves, and the cookie dies with the session on the server's side.
  }
  dispatch(sessionActions.ended(notice));
  dispatch(baseApi.util.resetApiState());
  resetBootstrap();
}

export type { ApiError };
