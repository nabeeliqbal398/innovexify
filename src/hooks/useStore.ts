"use client";

import { useDispatch, useSelector, useStore } from "react-redux";

import type { AppDispatch, AppStore, RootState } from "@/store";
import type { User } from "@/types/domain";

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

/** The signed-in person. Only used below the workspace gate, which renders nothing until a session exists. */
export function useMe(): User {
  return useAppSelector((s) => s.session.user) as User;
}
