import type { AppThunk } from "@/store";
import { check } from "@/store/actions/core";
import { userById } from "@/store/selectors";

/** Opening a follow-up dialog passes the same permission check the save does, so a refusal is explained. */
export function requestFollowupDialog(label: string, clientId?: string): AppThunk<boolean> {
  return (dispatch, getState) => {
    const client = userById(getState().workspace.data, clientId);
    return dispatch(check("followups", client, label, ""));
  };
}
