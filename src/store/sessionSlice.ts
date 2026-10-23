import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { User } from "@/types/domain";

export type SessionStatus = "booting" | "authenticated" | "anonymous";

export interface SessionState {
  status: SessionStatus;
  /** Lives in memory only (Redux state). Never written to any browser storage. */
  accessToken: string | null;
  user: User | null;
  /** Why the person is at the sign-in page, such as "Your session ended". Shown once. */
  notice: string | null;
}

const initialState: SessionState = { status: "booting", accessToken: null, user: null, notice: null };

const slice = createSlice({
  name: "session",
  initialState,
  reducers: {
    /** A new access token (after sign-in or a refresh). */
    tokenSet(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
    },
    /** Signed in: the token and who it belongs to. */
    signedIn(state, action: PayloadAction<{ accessToken: string; user: User }>) {
      state.status = "authenticated";
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.notice = null;
    },
    userUpdated(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
    /** The session is over: sign-out, a failed refresh, or no session at start-up. */
    ended(state, action: PayloadAction<string | null | undefined>) {
      state.status = "anonymous";
      state.accessToken = null;
      state.user = null;
      state.notice = action.payload ?? null;
    },
    noticeShown(state) {
      state.notice = null;
    },
  },
});

export const sessionActions = slice.actions;
export const sessionReducer = slice.reducer;
