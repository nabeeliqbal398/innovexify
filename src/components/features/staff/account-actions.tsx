"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { can } from "@/lib/permissions";
import { requestEmailChange, requestRemove, toggleSuspend } from "@/store/actions/people";
import type { User } from "@/types/domain";

interface AccountActionsProps {
  user: User;
  /** Called after the guard allows the change; the parent opens the matching dialog. */
  onEmail: (id: string) => void;
  onRemove: (id: string) => void;
  removeLabel?: string;
}

/** Edit email, suspend and remove for one account. Locked buttons stay clickable so the refusal is explained. */
export function AccountActions({ user, onEmail, onRemove, removeLabel = "Remove" }: AccountActionsProps) {
  const dispatch = useAppDispatch();
  const me = useMe();
  const canEmail = can(me, "updateEmail", user);
  const canSuspend = can(me, "suspendUser", user);
  const canRemove = can(me, "removeUser", user);
  const lock = (locked: boolean) => (locked ? <Icon name="lock" small /> : null);

  return (
    <div className="flex flex-nowrap gap-1">
      <Button
        size="sm"
        variant={canEmail ? "default" : "locked"}
        onClick={() => {
          if (dispatch(requestEmailChange(user.id))) onEmail(user.id);
        }}
      >
        {lock(!canEmail)}Edit email
      </Button>
      <Button size="sm" variant={canSuspend ? "default" : "locked"} onClick={() => dispatch(toggleSuspend(user.id))}>
        {lock(!canSuspend)}
        {user.status === "Suspended" ? "Reactivate" : "Suspend"}
      </Button>
      <Button
        size="sm"
        variant={canRemove ? "bad" : "locked"}
        onClick={() => {
          if (dispatch(requestRemove(user.id))) onRemove(user.id);
        }}
      >
        {lock(!canRemove)}
        {removeLabel}
      </Button>
    </div>
  );
}
