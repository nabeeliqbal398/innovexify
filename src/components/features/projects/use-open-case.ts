"use client";

import { useCallback } from "react";

import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { openCaseCheck } from "@/store/actions/cases";

/** Opens a case after the permission check; Admin and Manager use Case Management, the others Clients. */
export function useOpenCase(nav: WorkspaceNav): (projectId: string, tab?: string) => void {
  const dispatch = useAppDispatch();
  const me = useMe();
  const view = me.role === "ADMIN" || me.role === "MANAGER" ? "cases" : "clients";
  return useCallback(
    (projectId, tab) => {
      if (!dispatch(openCaseCheck(projectId))) return;
      nav.go(view, { id: projectId, query: { tab } });
    },
    [dispatch, nav, view],
  );
}
