"use client";

import { useState } from "react";

import { QueryState } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/primitives";
import { NAV } from "@/constants/nav";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { usePageVisible } from "@/hooks/usePageVisible";
import { ago } from "@/lib/dates";
import {
  useDeleteNotificationMutation,
  useLazyNotificationsQuery,
  useNotificationsQuery,
  useReadAllNotificationsMutation,
  useReadNotificationMutation,
  useUnreadNotificationsQuery,
} from "@/store/api/notifications";
import type { AppNotification } from "@/types/domain";

type Tab = "unread" | "all";
const PAGE = 20;
export const NOTIFICATION_POLL_MS = 30_000;

/** Unread count for the bell, refreshed every 30 seconds while the tab is visible. */
export function useUnreadCount(): number {
  const visible = usePageVisible();
  const { data } = useUnreadNotificationsQuery(undefined, { pollingInterval: visible ? NOTIFICATION_POLL_MS : 0 });
  return data ?? 0;
}

export function NotificationsMenu({ nav, onClose }: { nav: WorkspaceNav; onClose: () => void }) {
  const me = useMe();
  const run = useAction();
  const visible = usePageVisible();
  const [tab, setTab] = useState<Tab>("unread");
  const [older, setOlder] = useState<AppNotification[]>([]);
  const unreadCount = useUnreadCount();
  const first = useNotificationsQuery({ unread: tab === "unread" || undefined, limit: PAGE }, { pollingInterval: visible ? NOTIFICATION_POLL_MS : 0 });
  const [loadMore, more] = useLazyNotificationsQuery();
  const [markRead] = useReadNotificationMutation();
  const [markAll, markingAll] = useReadAllNotificationsMutation();
  const [remove] = useDeleteNotificationMutation();
  const [cursor, setCursor] = useState<{ hasMore: boolean; before: string | null } | null>(null);

  // The first page is live; older pages are appended below it and dropped when the filter changes.
  const head = first.data?.items ?? [];
  const seen = new Set(head.map((n) => n.id));
  const items = [...head, ...older.filter((n) => !seen.has(n.id))];
  const hasMore = cursor ? cursor.hasMore : Boolean(first.data?.meta.hasMore);
  const nextBefore = cursor ? cursor.before : (first.data?.meta.nextBefore ?? null);

  const switchTab = (next: Tab): void => {
    setTab(next);
    setOlder([]);
    setCursor(null);
  };

  // A link is only ever a view name from this role's own navigation; anything else is ignored.
  const open = async (n: AppNotification): Promise<void> => {
    if (n.id && n.unread) await run(markRead(n.id), { quiet: true });
    onClose();
    if (n.link && NAV[me.role].some((item) => item.view === n.link)) nav.go(n.link);
  };

  const showMore = async (): Promise<void> => {
    if (!nextBefore) return;
    const page = await loadMore({ unread: tab === "unread" || undefined, before: nextBefore, limit: PAGE }).unwrap().catch(() => null);
    if (!page) return;
    setOlder((o) => [...o, ...page.items]);
    setCursor({ hasMore: page.meta.hasMore, before: page.meta.nextBefore });
  };

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-5 top-[54px] z-40 w-[min(380px,calc(100%-32px))] animate-pop overflow-hidden rounded-lg border border-border bg-surface shadow-pop max-[860px]:fixed max-[860px]:inset-x-2 max-[860px]:bottom-2 max-[860px]:top-auto max-[860px]:max-h-[75vh] max-[860px]:w-auto"
    >
      <div className="flex items-center gap-2 border-b border-muted py-2.5 pl-3.5 pr-3">
        <span className="h3 flex-1">Notifications</span>
        <Button variant="ghost" size="sm" disabled={markingAll.isLoading || unreadCount === 0} onClick={() => void run(markAll(), { quiet: true })}>
          Mark all as read
        </Button>
        <button
          type="button"
          aria-label="Close notifications"
          onClick={onClose}
          className="flex size-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-neutral hover:bg-muted"
        >
          <Icon name="x" small />
        </button>
      </div>
      <div className="mx-3.5 mb-1 mt-2">
        <Segmented
          tabs
          label="Notification filter"
          value={tab}
          onChange={switchTab}
          options={[
            { value: "unread", label: `Unread ${unreadCount}` },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      <div className="max-h-[min(420px,60vh)] overflow-auto">
        <QueryState
          query={first}
          isEmpty={items.length === 0}
          empty={{ title: "Nothing here", text: tab === "unread" ? "You are all caught up. Switch to All to see earlier notifications." : "No notifications yet." }}
          rows={3}
        >
          {items.map((n) => (
            <div key={n.id} className={`flex items-center gap-2 border-t border-muted py-2 pl-3.5 pr-2.5 ${n.unread ? "bg-primary-soft/40" : ""}`}>
              {n.unread ? <span role="img" aria-label="Unread" className="size-2 flex-none rounded-full bg-primary" /> : null}
              <button
                type="button"
                onClick={() => void open(n)}
                className="group flex flex-1 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent p-0.5 text-left"
              >
                <span className="text-sm group-hover:text-primary-soft-foreground group-hover:underline">{n.text}</span>
                <span className="help">{ago(n.at)}</span>
              </button>
              {n.unread && n.id ? (
                <Button variant="ghost" size="sm" onClick={() => void run(markRead(n.id as string), { quiet: true })}>
                  Mark read
                </Button>
              ) : null}
              {n.id ? (
                <button
                  type="button"
                  aria-label="Delete notification"
                  onClick={() => void run(remove(n.id as string), { quiet: true })}
                  className="flex size-7 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Icon name="x" small />
                </button>
              ) : null}
            </div>
          ))}
          {hasMore ? (
            <div className="border-t border-muted p-2 text-center">
              <Button size="sm" disabled={more.isFetching} onClick={() => void showMore()}>
                {more.isFetching ? "Loading…" : "Load older"}
              </Button>
            </div>
          ) : null}
        </QueryState>
      </div>
    </div>
  );
}
