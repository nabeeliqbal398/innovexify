"use client";

import { useCallback } from "react";

import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { useMe } from "@/hooks/useStore";

/**
 * Opens a case. `caseId` is the case's API id (the address is /cases/<id> for Admin and Manager, /clients/<id> for the others).
 * Whether the person may open it is the server's call: a case outside their scope is simply not found there.
 */
export function useOpenCase(nav: WorkspaceNav): (caseId: string, tab?: string) => void {
  const me = useMe();
  const view = me.role === "ADMIN" || me.role === "MANAGER" ? "cases" : "clients";
  return useCallback((caseId, tab) => nav.go(view, { id: caseId, query: { tab } }), [nav, view]);
}
