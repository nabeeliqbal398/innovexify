import type { AppThunk } from "@/store";
import { guard } from "@/store/actions/core";
import { workspaceActions } from "@/store/workspaceSlice";
import type { Trigger } from "@/types/domain";

/** Turn a notification trigger on or off. Admin and Manager only. */
export function manageTriggers(trigger: Trigger): AppThunk<boolean> {
  return (dispatch) => {
    const verb = trigger.on ? "Turned off" : "Turned on";
    if (!dispatch(guard("manageTriggers", undefined, `${verb} ${trigger.name}`, ""))) return false;
    dispatch(workspaceActions.triggerPatched({ k: trigger.k, patch: { on: !trigger.on } }));
    return true;
  };
}

/** Choose the email template for a trigger. Admin only. */
export function manageTemplates(trigger: Trigger, tpl: string): AppThunk<boolean> {
  return (dispatch) => {
    if (!dispatch(guard("manageTemplates", undefined, `Changed template for ${trigger.name}`, tpl))) return false;
    dispatch(workspaceActions.triggerPatched({ k: trigger.k, patch: { tpl } }));
    return true;
  };
}
