"use client";

import { notFound, useRouter } from "next/navigation";
import { useEffect } from "react";

import { WorkspaceShell } from "@/components/features/workspace/workspace-shell";
import { ViewOutlet } from "@/components/features/workspace/view-registry";
import { NAV } from "@/constants/nav";
import { DEFAULT_VIEW, LOCKED_USER, PATH_ROLE } from "@/constants/vocab";
import { useWorkspaceNav } from "@/hooks/useWorkspaceNav";
import { useAppDispatch, useAppSelector, useMe } from "@/hooks/useStore";
import { workspaceActions } from "@/store/workspaceSlice";

/**
 * One role-locked workspace. The route fixes who is signed in, so the screen can only ever act as that user.
 * Visiting a workspace starts from the seeded data.
 */
export function WorkspacePage({ rolePath, slug }: { rolePath: string; slug: string[] }) {
  const role = PATH_ROLE[rolePath];
  if (!role) notFound();

  const dispatch = useAppDispatch();
  const router = useRouter();
  const lockedUid = useAppSelector((s) => s.workspace.lockedUid);
  const expected = LOCKED_USER[role];
  const ready = lockedUid === expected;

  useEffect(() => {
    if (lockedUid !== expected) dispatch(workspaceActions.enterWorkspace({ meId: expected, locked: true }));
  }, [dispatch, expected, lockedUid]);

  const view = slug[0] ?? DEFAULT_VIEW[role];
  const id = slug[1] ? decodeURIComponent(slug[1]) : undefined;

  useEffect(() => {
    if (!slug[0]) router.replace(`/${rolePath}/${DEFAULT_VIEW[role]}`);
  }, [slug, router, rolePath, role]);

  if (!ready) return <div className="min-h-screen bg-background" aria-busy="true" />;
  const allowed = NAV[role].some((n) => n.view === view);
  if (slug[0] && !allowed) notFound();
  return <ReadyWorkspace view={view} id={id} />;
}

function ReadyWorkspace({ view, id }: { view: string; id?: string }) {
  const nav = useWorkspaceNav(view, id);
  const me = useMe();
  return (
    <WorkspaceShell key={me.id} view={view} id={id}>
      <ViewOutlet nav={nav} />
    </WorkspaceShell>
  );
}
