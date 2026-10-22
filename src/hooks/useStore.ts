"use client";

import { useDispatch, useSelector, useStore } from "react-redux";

import type { AppDispatch, AppStore, RootState } from "@/store";
import { selectData, selectMe } from "@/store/selectors";
import type { DemoData, User } from "@/types/domain";

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

export function useData(): DemoData {
  return useAppSelector(selectData);
}

export function useMe(): User {
  return useAppSelector(selectMe);
}
