import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface DeniedNotice {
  title: string;
  body: string;
}

export interface UiState {
  /** A refusal from the server (403 PERMISSION_DENIED) explained to the person, with the server's own wording. */
  denied: DeniedNotice | null;
  /** The record changed under the person while they were editing (409 CONCURRENT_MODIFICATION). */
  conflict: { message: string } | null;
}

const slice = createSlice({
  name: "ui",
  initialState: { denied: null, conflict: null } as UiState,
  reducers: {
    deniedSet(state, action: PayloadAction<DeniedNotice | null>) {
      state.denied = action.payload;
    },
    conflictSet(state, action: PayloadAction<{ message: string } | null>) {
      state.conflict = action.payload;
    },
  },
});

export const uiActions = slice.actions;
export const uiReducer = slice.reducer;
