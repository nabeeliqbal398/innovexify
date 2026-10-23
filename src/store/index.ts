import { configureStore, type ThunkAction, type UnknownAction } from "@reduxjs/toolkit";

import { baseApi } from "./api/base";
import { sessionReducer } from "./sessionSlice";
import { uiReducer } from "./uiSlice";

export function makeStore() {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      session: sessionReducer,
      ui: uiReducer,
    },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;
