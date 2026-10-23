"use client";

import { notFound, useRouter } from "next/navigation";
import { useEffect } from "react";

import { WorkspaceShell } from "@/components/features/workspace/workspace-shell";
import { ViewOutlet } from "@/components/features/workspace/view-registry";
import { NAV } from "@/constants/nav";
import { DEFAULT_VIEW, PATH_ROLE } from "@/constants/vocab";
import { useWorkspaceNav } from "@/hooks/useWorkspaceNav";
import { useAppSelector, useMe } from "@/hooks/useStore";

function WorkspaceSkeleton() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading your workspace">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10">
        <div className="skel h-8 w-1/3" />
        <div className="skel h-24" />
        <div className="skel h-24" />
      </div>
    </div>
  );
}

/**
 * One role's workspace. Who is signed in comes from the session (the refresh cookie, checked at page load), never from the URL.
 * Nobody signed in goes to the sign-in page; someone whose role doesn't match the address gets the "not available" page.
 * This is a convenience for the person: the server decides what each request may do.
 */
export function WorkspacePage({ rolePath, slug }: { rolePath: string; slug: string[] }) {
  const role = PATH_ROLE[rolePath];
  if (!role) notFound();

  const router = useRouter();
  const status = useAppSelector((s) => s.session.status);
  const user = useAppSelector((s) => s.session.user);

  const view = slug[0] ?? DEFAULT_VIEW[role];
  const id = slug[1] ? decodeURIComponent(slug[1]) : undefined;

  useEffect(() => {
    if (status === "anonymous") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && user?.role === role && !slug[0]) router.replace(`/${rolePath}/${DEFAULT_VIEW[role]}`);
  }, [status, user, slug, router, rolePath, role]);

  if (status !== "authenticated" || !user) return <WorkspaceSkeleton />;
  if (user.role !== role) notFound();
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
