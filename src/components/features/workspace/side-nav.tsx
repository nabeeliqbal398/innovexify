"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { NAV } from "@/constants/nav";
import { ROLE_LABEL } from "@/constants/vocab";
import { cn } from "@/lib/cn";
import { useMe } from "@/hooks/useStore";
import { usePageVisible } from "@/hooks/usePageVisible";
import { useNavCountsQuery } from "@/store/api/dashboard";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";

export function SideNav({ nav }: { nav: WorkspaceNav }) {
  const me = useMe();
  const visible = usePageVisible();
  // The numbers on the items come from the server and refresh every 30 seconds while the tab is visible.
  const { data: counts } = useNavCountsQuery(undefined, { pollingInterval: visible ? 30_000 : 0 });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const items = NAV[me.role];
  const groups = useMemo(() => {
    const names: string[] = [];
    items.forEach((i) => {
      if (!names.includes(i.group)) names.push(i.group);
    });
    return names.map((name) => ({ name, items: items.filter((i) => i.group === name) }));
  }, [items]);
  const staff = me.role !== "CLIENT";
  const activeView = nav.view;

  return (
    <nav
      aria-label={`${ROLE_LABEL[me.role]} navigation`}
      className={cn(
        "flex flex-[0_0_236px] flex-col gap-0.5 px-2.5 py-3.5",
        staff ? "bg-sidebar text-sidebar-foreground" : "border-r border-border bg-surface",
        "max-[860px]:flex-[1_1_100%] max-[860px]:flex-row max-[860px]:items-center max-[860px]:overflow-x-auto",
        staff && "max-[860px]:pr-10 max-[860px]:[mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)]",
        !staff && "max-[860px]:grid max-[860px]:grid-cols-4 max-[860px]:gap-1 max-[860px]:border-b max-[860px]:border-r-0 max-[860px]:px-2 max-[860px]:py-1.5",
      )}
    >
      <div className={cn("px-2.5 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] max-[860px]:hidden", staff ? "text-sidebar-muted" : "text-muted-foreground")}>
        {ROLE_LABEL[me.role]} · {me.name.split(" ")[0]}
      </div>
      {groups.map((g) => {
        const hasActive = g.items.some((i) => i.view === activeView);
        const isCollapsed = Boolean(collapsed[g.name]) && !hasActive;
        return (
          <div key={g.name || "main"} className="mb-1.5 flex flex-col gap-0.5 max-[860px]:contents">
            {g.name ? (
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((c) => ({ ...c, [g.name]: !c[g.name] }))}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between rounded-md border-0 bg-transparent px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] max-[860px]:hidden",
                  staff ? "text-sidebar-muted hover:text-slate-200" : "text-muted-foreground",
                )}
              >
                <span>{g.name}</span>
                <Icon name={isCollapsed ? "chevR" : "chevD"} small />
              </button>
            ) : null}
            {g.items.map((item) => {
              const on = item.view === activeView;
              const count = counts?.[item.view as keyof typeof counts] ?? 0;
              return (
                <button
                  key={item.view}
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => nav.go(item.view)}
                  className={cn(
                    "relative flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left font-medium",
                    isCollapsed && "min-[861px]:hidden",
                    staff
                      ? cn("text-sidebar-foreground hover:bg-sidebar-hover hover:text-white focus-visible:outline-sidebar-accent", on && "bg-sidebar-hover text-white shadow-[inset_0_0_0_1px_hsl(var(--border-strong)/0.35)] [&_svg:first-child]:text-sidebar-accent")
                      : cn("text-foreground/80 hover:bg-muted hover:text-foreground", on && "bg-primary-soft text-primary-soft-foreground"),
                    "max-[860px]:w-auto max-[860px]:whitespace-nowrap",
                    !staff && "max-[860px]:min-h-[52px] max-[860px]:flex-col max-[860px]:justify-center max-[860px]:gap-[3px] max-[860px]:px-1 max-[860px]:py-1.5 max-[860px]:text-center max-[860px]:text-xs",
                  )}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {count ? (
                    <span
                      className={cn(
                        "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground",
                        !staff && "max-[860px]:absolute max-[860px]:right-[calc(50%-22px)] max-[860px]:top-1 max-[860px]:m-0 max-[860px]:h-[18px] max-[860px]:min-w-[18px] max-[860px]:text-[11px]",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
