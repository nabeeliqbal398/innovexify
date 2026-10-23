"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { can } from "@/lib/permissions";
import { useChangeEmailMutation, useSetUserStatusMutation } from "@/store/api/people";
import type { User } from "@/types/domain";

interface AccountActionsProps {
  user: User;
  /** The parent opens the matching dialog. */
  onEmail: (user: User) => void;
  onRemove: (user: User) => void;
  removeLabel?: string;
}

/**
 * Edit email, suspend and remove for one account. The lock icon is a hint from the permission table; the server decides.
 * A locked button is still clickable: suspend and email send the real request so the refusal is explained with the server's
 * reason and written to the audit log. Remove always asks for confirmation first, so nothing is ever deleted by a hint.
 */
export function AccountActions({ user, onEmail, onRemove, removeLabel = "Remove" }: AccountActionsProps) {
  const me = useMe();
  const run = useAction();
  const [setStatus, status] = useSetUserStatusMutation();
  const [changeEmail] = useChangeEmailMutation();
  const canEmail = can(me, "updateEmail", user);
  const canSuspend = can(me, "suspendUser", user);
  const canRemove = can(me, "removeUser", user);
  const lock = (locked: boolean) => (locked ? <Icon name="lock" small /> : null);

  const suspend = async () => {
    const next = user.status === "Suspended" ? "ACTIVE" : "SUSPENDED";
    await run(setStatus({ id: user.id, status: next }), {
      success: next === "SUSPENDED" ? `${user.name} suspended. Nothing was deleted.` : `${user.name} reactivated`,
    });
  };

  const email = async () => {
    if (canEmail) return onEmail(user);
    // Locked: ask the server with the current email, so it refuses (and audits the attempt) before anything else.
    await run(changeEmail({ id: user.id, email: user.email }));
  };

  return (
    <div className="flex flex-nowrap gap-1">
      <Button size="sm" variant={canEmail ? "default" : "locked"} onClick={() => void email()}>
        {lock(!canEmail)}Edit email
      </Button>
      <Button size="sm" variant={canSuspend ? "default" : "locked"} disabled={status.isLoading} onClick={() => void suspend()}>
        {lock(!canSuspend)}
        {user.status === "Suspended" ? "Reactivate" : "Suspend"}
      </Button>
      <Button size="sm" variant={canRemove ? "bad" : "locked"} onClick={() => onRemove(user)}>
        {lock(!canRemove)}
        {removeLabel}
      </Button>
    </div>
  );
}
