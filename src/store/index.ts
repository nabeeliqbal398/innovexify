import { configureStore, type ThunkAction, type UnknownAction } from "@reduxjs/toolkit";

import { workspaceReducer } from "./workspaceSlice";

export function makeStore() {
  return configureStore({
    reducer: { workspace: workspaceReducer },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;
