"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ConflictDialog } from "@/components/features/workspace/conflict-dialog";
import { DeniedDialog } from "@/components/features/workspace/denied-dialog";
import { GlobalSearch } from "@/components/features/workspace/global-search";
import { NotificationsMenu, useUnreadCount } from "@/components/features/workspace/notifications-menu";
import { SideNav } from "@/components/features/workspace/side-nav";
import { ThemeToggle } from "@/components/features/workspace/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { DEFAULT_VIEW, ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { NAV } from "@/constants/nav";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { useWorkspaceNav, type WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { signOut } from "@/lib/session";
import { useCompanyQuery } from "@/store/api/system";

interface Crumb {
  label: string;
  go?: () => void;
}

function useCrumbs(nav: WorkspaceNav, companyName: string): Crumb[] {
  const me = useMe();
  const current = NAV[me.role].find((n) => n.view === nav.view);
  const crumbs: Crumb[] = [{ label: companyName, go: () => nav.go(DEFAULT_VIEW[me.role]) }];
  if (current?.group) crumbs.push({ label: current.group });
  const label = current?.label ?? (nav.view === "help" ? "Help & Guidance" : "");
  if (label) crumbs.push({ label, go: nav.id ? () => nav.go(nav.view) : undefined });
  if (nav.id) crumbs.push({ label: "Case details" });
  return crumbs;
}

/** Header, role navigation and the page outlet shared by every workspace. */
export function WorkspaceShell({ view, id, children }: { view: string; id?: string; children: ReactNode }) {
  const me = useMe();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const company = useCompanyQuery().data ?? { name: "Innovexify", logo: "", casePrefix: "CASE" };
  const nav = useWorkspaceNav(view, id);
  const crumbs = useCrumbs(nav, company.name);
  const [menu, setMenu] = useState<"notifications" | "search" | null>(null);
  const isStaff = me.role !== "CLIENT";
  const unread = useUnreadCount();
  const [leaving, setLeaving] = useState(false);
  const leave = async (): Promise<void> => {
    setLeaving(true);
    await signOut(dispatch);
    router.replace("/");
  };

  useEffect(() => {
    setMenu(null);
  }, [view, id]);

  return (
    <div>
      <a
        href="#main-view"
        className="absolute -left-[9999px] top-2 z-[100] rounded-md bg-foreground px-3 py-2 text-background focus:left-2"
      >
        Skip to content
      </a>
      <header className="relative z-10 flex flex-wrap items-center gap-2.5 border-b border-border bg-surface px-5 py-2.5">
        <div className="flex items-center gap-[9px] text-xl font-bold tracking-tight" aria-label={company.name}>
          {company.logo ? (
            // Uploaded logos are data URLs chosen by the Admin, so next/image has nothing to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo} alt={`${company.name} logo`} className="h-7 w-auto max-w-[120px] object-contain" />
          ) : null}
          <span>{company.name}</span>
        </div>
        <Badge tone={ROLE_TONE[me.role]}>
          <span>{ROLE_LABEL[me.role]} workspace</span>
        </Badge>
        <GlobalSearch open={menu === "search"} onOpenChange={(o) => setMenu(o ? "search" : null)} nav={nav} />
        <div className="flex-1" />
        <span className="help inline-flex items-center gap-1.5 max-[860px]:sr-only">
          <span>Signed in as</span>
          <strong className="text-foreground">
            <span>{me.name}</span>
          </strong>
        </span>
        <ThemeToggle />
        <Button size="sm" variant="ghost" disabled={leaving} onClick={() => void leave()}>
          {leaving ? "Signing out…" : "Sign out"}
        </Button>
        {isStaff ? (
          <Button variant="ghost" size="icon" aria-label="Help and guidance" title="Help and guidance" onClick={() => nav.go("help")}>
            <Icon name="help" />
          </Button>
        ) : null}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications, ${unread} unread`}
            aria-expanded={menu === "notifications"}
            onClick={() => setMenu(menu === "notifications" ? null : "notifications")}
          >
            <Icon name="bell" />
            {unread ? (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                {unread}
              </span>
            ) : null}
          </Button>
        </div>
        {menu ? <div aria-hidden="true" className="fixed inset-0 z-20" onClick={() => setMenu(null)} /> : null}
        {menu === "notifications" ? <NotificationsMenu nav={nav} onClose={() => setMenu(null)} /> : null}
      </header>

      <div className="flex min-h-[calc(100vh-56px)] flex-wrap max-[860px]:content-start">
        <SideNav nav={nav} />
        <main
          id="main-view"
          tabIndex={-1}
          className="flex min-w-0 flex-[999_1_560px] animate-rise flex-col gap-4 px-6 pb-10 pt-[22px] max-[860px]:p-4"
        >
          <nav aria-label="Breadcrumb" className="-mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 ? (
                    <span aria-hidden="true" className="text-border-strong">
                      /
                    </span>
                  ) : null}
                  {c.go && !last ? (
                    <button type="button" onClick={c.go} className="cursor-pointer rounded border-0 bg-transparent px-0 py-0.5 text-primary-soft-foreground hover:underline">
                      {c.label}
                    </button>
                  ) : (
                    <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-foreground" : undefined}>
                      {c.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
          {children}
        </main>
      </div>
      <DeniedDialog />
      <ConflictDialog />
    </div>
  );
}
