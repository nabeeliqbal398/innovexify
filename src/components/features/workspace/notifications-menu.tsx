"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/primitives";
import { ago } from "@/lib/dates";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { readNotification } from "@/store/actions/comms";
import { workspaceActions } from "@/store/workspaceSlice";

type Tab = "unread" | "all";

export function NotificationsMenu({ nav, onClose }: { nav: WorkspaceNav; onClose: () => void }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState<Tab>("unread");

  const all = (data.notifs[me.id] ?? []).map((n, index) => ({ n, index }));
  const unreadCount = all.filter((x) => x.n.unread).length;
  const shown = all.filter((x) => tab === "all" || x.n.unread).slice(0, 20);

  const open = (index: number): void => {
    const target = dispatch(readNotification(index, true));
    onClose();
    if (target) nav.go(target);
  };

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-5 top-[54px] z-40 w-[min(380px,calc(100%-32px))] animate-pop overflow-hidden rounded-lg border border-border bg-surface shadow-pop max-[860px]:fixed max-[860px]:inset-x-2 max-[860px]:bottom-2 max-[860px]:top-auto max-[860px]:max-h-[75vh] max-[860px]:w-auto"
    >
      <div className="flex items-center gap-2 border-b border-muted py-2.5 pl-3.5 pr-3">
        <span className="h3 flex-1">Notifications</span>
        <Button variant="ghost" size="sm" onClick={() => dispatch(workspaceActions.notificationsReadAll(me.id))}>
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
          onChange={setTab}
          options={[
            { value: "unread", label: `Unread ${unreadCount}` },
            { value: "all", label: `All ${all.length}` },
          ]}
        />
      </div>
      <div className="max-h-[min(420px,60vh)] overflow-auto">
        {shown.map(({ n, index }) => (
          <div key={`${index}-${n.text}`} className={`flex items-center gap-2 border-t border-muted py-2 pl-3.5 pr-2.5 ${n.unread ? "bg-primary-soft/40" : ""}`}>
            {n.unread ? <span role="img" aria-label="Unread" className="size-2 flex-none rounded-full bg-primary" /> : null}
            <button
              type="button"
              onClick={() => open(index)}
              className="group flex flex-1 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent p-0.5 text-left"
            >
              <span className="text-sm group-hover:text-primary-soft-foreground group-hover:underline">{n.text}</span>
              <span className="help">{n.at ? ago(n.at) : n.time}</span>
            </button>
            {n.unread ? (
              <Button variant="ghost" size="sm" onClick={() => dispatch(readNotification(index, false))}>
                Mark read
              </Button>
            ) : null}
          </div>
        ))}
        {shown.length === 0 ? (
          <div className="empty-s">
            <strong>Nothing here</strong>
            <span className="help">
              {tab === "unread" && all.length ? "You're all caught up. Switch to All to see earlier notifications." : "No notifications yet."}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
