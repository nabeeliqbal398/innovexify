import { toast } from "react-toastify";

import { ROLE_LABEL } from "@/constants/vocab";
import { stamp } from "@/lib/dates";
import { auditCategoryOf, can, REASON, type Permission, type PermissionResource } from "@/lib/permissions";
import type { AppThunk } from "@/store";
import { selectMe } from "@/store/selectors";
import { workspaceActions } from "@/store/workspaceSlice";
import type { Role } from "@/types/domain";

/** Outcome of an action. `error` is a message the caller shows next to the form field. */
export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string | number;
}
export const OK: ActionResult = { ok: true };
export const fail = (error: string): ActionResult => ({ ok: false, error });

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function flash(message: string): void {
  toast.success(message);
}

/** Append an entry to the audit log as the signed-in user. */
export function audit(action: string, target: string, ok: boolean, cat = ""): AppThunk {
  return (dispatch, getState) => {
    const me = selectMe(getState());
    dispatch(
      workspaceActions.audited({
        time: stamp(),
        at: Date.now(),
        actor: me.id,
        role: me.role,
        action,
        target,
        ok,
        cat,
      }),
    );
  };
}

export interface GuardOptions {
  /** Skip the "not available" dialog; the refusal is still logged. */
  silent?: boolean;
  cat?: string;
}

/**
 * Check a permission for the signed-in user, log the attempt, and explain a refusal.
 * Every state-changing action goes through here, not just the buttons that trigger it.
 */
export function guard(
  perm: Permission,
  res: PermissionResource | undefined,
  action: string,
  target: string,
  opts: GuardOptions = {},
): AppThunk<boolean> {
  return (dispatch, getState) => {
    const me = selectMe(getState());
    const ok = can(me, perm, res);
    dispatch(audit(`${ok ? "" : "Refused: "}${action}`, target, ok, opts.cat ?? auditCategoryOf(perm)));
    if (!ok && !opts.silent) {
      dispatch(
        workspaceActions.deniedSet({
          title: `Not available to ${ROLE_LABEL[me.role]}`,
          body: REASON[perm] ?? REASON.default,
        }),
      );
    }
    return ok;
  };
}

/** A read-only check: allowed reads are not logged, refusals are logged and explained. */
export function check(
  perm: Permission,
  res: PermissionResource | undefined,
  action: string,
  target: string,
): AppThunk<boolean> {
  return (dispatch, getState) => {
    if (can(selectMe(getState()), perm, res)) return true;
    dispatch(guard(perm, res, action, target));
    return false;
  };
}

/** Raise an in-app notification for each id. `link` is the view the notification opens. */
export function notify(ids: Array<string | null | undefined>, text: string, link?: string): AppThunk {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const clean = ids.filter((id): id is string => Boolean(id));
    clean.forEach((id) => {
      const target = data.users.find((u) => u.id === id);
      const fallback = target?.role === "CLIENT" ? "home" : "overview";
      dispatch(workspaceActions.notified({ ids: [id], text, link: link ?? fallback }));
    });
  };
}

export function showDenied(title: string, body: string): AppThunk {
  return (dispatch) => {
    dispatch(workspaceActions.deniedSet({ title, body }));
  };
}

export function roleOf(role: Role): string {
  return ROLE_LABEL[role];
}
