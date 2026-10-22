import { ROLE_LABEL } from "@/constants/vocab";
import type { Permission } from "@/lib/permissions";
import type { AppThunk } from "@/store";
import { audit, EMAIL_PATTERN, fail, flash, guard, notify, OK, showDenied, type ActionResult } from "@/store/actions/core";
import { selectMe, userById } from "@/store/selectors";
import { workspaceActions } from "@/store/workspaceSlice";
import type { NotificationPrefs, Role, User } from "@/types/domain";

export interface InviteInput {
  role: Role;
  name: string;
  email: string;
  /** "me", "none", a CSR id, or empty. Only used for client invitations. */
  csr: string;
  note: string;
}

export function inviteUser(input: InviteInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return fail("Enter a valid email address.");
    if (data.users.some((u) => u.email.toLowerCase() === email && u.status !== "Removed")) {
      return fail("This email already belongs to an account or invitation.");
    }
    let csr: string | null = null;
    if (input.role === "CLIENT") {
      csr = input.csr === "me" ? me.id : input.csr && input.csr !== "none" ? input.csr : null;
      if (me.role === "CSR" && !csr) return fail("Assign the client to yourself or another CSR.");
      if (csr) {
        const csrUser = userById(data, csr);
        if (!csrUser || csrUser.role !== "CSR" || csrUser.status !== "Active") {
          return fail("Choose an existing, active CSR.");
        }
      }
    }
    const perm = `invite${input.role}` as Permission;
    if (!dispatch(guard(perm, undefined, `Invited ${ROLE_LABEL[input.role]}`, email))) {
      return fail("You can't send this invitation.");
    }
    const name = input.name.trim() || email.split("@")[0];
    const { counters, company } = data;
    const isClient = input.role === "CLIENT";
    const id = isClient ? `c${counters.nextCase}` : `u${counters.nextUser}`;
    const user: User = {
      id,
      name,
      email,
      role: input.role,
      status: "Invited",
      invitedBy: me.id,
      ...(isClient
        ? {
            caseId: `${company.casePrefix}-2026-${String(counters.nextCase).padStart(4, "0")}`,
            csr,
            biz: "",
            state: "",
            phone: "",
            address: "",
            contactPref: "Portal message",
            joinedAt: Date.now(),
          }
        : {}),
    };
    dispatch(workspaceActions.added({ key: "users", item: user }));
    dispatch(workspaceActions.counterBumped(isClient ? "nextCase" : "nextUser"));
    if (isClient) dispatch(workspaceActions.threadOpened(id));
    if (isClient && csr) {
      dispatch(notify([csr], `New client assigned to you: ${name}`));
      dispatch(audit(`Assigned CSR ${userById(data, csr)?.name ?? ""}`, name, true));
    }
    flash(`${ROLE_LABEL[input.role]} invitation sent to ${email} (email simulated)`);
    return { ok: true, id };
  };
}

export function acceptInvitation(id: string): AppThunk {
  return (dispatch, getState) => {
    const target = userById(getState().workspace.data, id);
    if (!target) return;
    dispatch(workspaceActions.patched({ key: "users", id, patch: { status: "Active" } }));
    dispatch(audit("Invitation accepted (simulated)", target.name, true));
    if (target.role === "CLIENT" && target.csr) dispatch(notify([target.csr], `${target.name} accepted the invitation`));
    flash(`${target.name} is now active and can sign in`);
  };
}

export function assignCsr(clientId: string, csrId: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const client = userById(data, clientId);
    if (!client) return fail("That client no longer exists.");
    if (!dispatch(guard("assignNewClient", client, "Assigned CSR", client.caseId ?? ""))) return fail("Not allowed.");
    const target = csrId === "me" ? me.id : csrId;
    const csr = userById(data, target);
    if (!csr || csr.role !== "CSR" || csr.status !== "Active") return fail("Choose an existing, active CSR.");
    dispatch(workspaceActions.patched({ key: "users", id: clientId, patch: { csr: target } }));
    dispatch(audit(`Assigned ${client.name} to ${csr.name}`, client.caseId ?? "", true));
    dispatch(notify([target], `New client assigned to you: ${client.name}`));
    flash(`${client.name} assigned to ${csr.name}`);
    return OK;
  };
}

export function reassignCsr(clientId: string, csrId: string, reason: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const client = userById(data, clientId);
    const next = userById(data, csrId);
    if (!client) return fail("That client no longer exists.");
    if (!next || next.role !== "CSR" || next.status !== "Active") return fail("Select an active CSR.");
    if (!dispatch(guard("reassignClient", client, "Reassigned CSR", client.caseId ?? ""))) return fail("Not allowed.");
    const prev = userById(data, client.csr);
    dispatch(workspaceActions.patched({ key: "users", id: clientId, patch: { csr: next.id } }));
    const why = reason.trim() ? ` · reason: ${reason.trim()}` : "";
    dispatch(audit(`Reassigned ${client.name} from ${prev?.name ?? "unassigned"} to ${next.name}${why}`, client.caseId ?? "", true));
    dispatch(notify([next.id, prev?.id], `${client.name} reassigned to ${next.name}`));
    flash(`${client.name} now assigned to ${next.name}`);
    return OK;
  };
}

/** Opening a dialog still has to pass the permission check, so a locked button can explain itself. */
export function requestReassign(clientId: string): AppThunk<boolean> {
  return (dispatch, getState) => {
    const client = userById(getState().workspace.data, clientId);
    return dispatch(guard("reassignClient", client, "Reassign CSR", client?.caseId ?? ""));
  };
}

export function requestEmailChange(id: string): AppThunk<boolean> {
  return (dispatch, getState) => {
    const target = userById(getState().workspace.data, id);
    return dispatch(guard("updateEmail", target, "Open email change", target?.name ?? ""));
  };
}

export function changeEmail(id: string, rawEmail: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const target = userById(data, id);
    if (!target) return fail("That account no longer exists.");
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return fail("Enter a valid email address.");
    if (data.users.some((u) => u.id !== id && u.email.toLowerCase() === email && u.status !== "Removed")) {
      return fail("Another account already uses this email.");
    }
    if (email === target.email.toLowerCase()) return fail("That's the current email.");
    if (!dispatch(guard("updateEmail", target, `Changed email for ${target.name} from ${target.email} to ${email}`, target.caseId ?? target.name))) {
      return fail("Not allowed.");
    }
    dispatch(workspaceActions.patched({ key: "users", id, patch: { email } }));
    dispatch(notify([id], `Your login email was changed to ${email}`));
    flash("Email updated. Verification and old-address notice simulated.");
    return OK;
  };
}

export function toggleSuspend(id: string): AppThunk {
  return (dispatch, getState) => {
    const target = userById(getState().workspace.data, id);
    if (!target) return;
    const next = target.status === "Suspended" ? "Active" : "Suspended";
    const verb = next === "Suspended" ? "Suspended " : "Reactivated ";
    if (!dispatch(guard("suspendUser", target, `${verb}${target.name}`, target.caseId ?? target.email))) return;
    dispatch(workspaceActions.patched({ key: "users", id, patch: { status: next } }));
    flash(next === "Suspended" ? `${target.name} suspended. Nothing was deleted.` : `${target.name} reactivated`);
  };
}

/** Returns true when the removal confirmation dialog may open. */
export function requestRemove(id: string): AppThunk<boolean> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const target = userById(data, id);
    if (!target) return false;
    if (!dispatch(guard("removeUser", target, `Remove ${target.name}`, target.caseId ?? target.email))) return false;
    if (target.role === "ADMIN" && data.users.filter((u) => u.role === "ADMIN" && u.status !== "Removed").length < 2) {
      dispatch(showDenied("Can't remove the last Admin", "Invite another Admin first so the portal always has an owner."));
      return false;
    }
    const assigned = data.users.filter((u) => u.csr === id && u.status !== "Removed");
    if (target.role === "CSR" && assigned.length) {
      dispatch(
        showDenied(
          "Reassign clients first",
          `${target.name} is the CSR for ${assigned.map((u) => u.name).join(", ")}. Reassign them before removing this account, so no client is left without a CSR.`,
        ),
      );
      return false;
    }
    return true;
  };
}

export function removeUser(id: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const target = userById(getState().workspace.data, id);
    if (!target) return fail("That account no longer exists.");
    if (!dispatch(guard("removeUser", target, `Removed ${target.name} from the portal`, target.caseId ?? target.email))) {
      return fail("Not allowed.");
    }
    dispatch(workspaceActions.patched({ key: "users", id, patch: { status: "Removed" } }));
    flash(`${target.name} removed from the portal (demo state)`);
    return OK;
  };
}

export function saveBranding(name: string, logo: string): AppThunk<ActionResult> {
  return (dispatch) => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) return fail("Enter a company name (2–60 characters).");
    if (!dispatch(guard("branding", undefined, "Updated company branding", "Company settings"))) return fail("Not allowed.");
    dispatch(workspaceActions.companyPatched({ name: trimmed, logo }));
    flash("Branding saved");
    return OK;
  };
}

export function saveCasePrefix(prefix: string): AppThunk<ActionResult> {
  return (dispatch) => {
    const clean = prefix.trim().toUpperCase();
    if (!/^[A-Z]{2,8}$/.test(clean)) return fail("Use 2–8 letters for the case ID prefix.");
    if (!dispatch(guard("operationalSettings", undefined, `Changed case ID prefix to ${clean}`, "Company settings"))) {
      return fail("Not allowed.");
    }
    dispatch(workspaceActions.companyPatched({ casePrefix: clean }));
    flash("Case-management defaults saved");
    return OK;
  };
}

export function saveOwnName(name: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const me = selectMe(getState());
    const trimmed = name.trim();
    if (!trimmed) return fail("Enter your full name.");
    dispatch(workspaceActions.patched({ key: "users", id: me.id, patch: { name: trimmed } }));
    dispatch(audit("Updated own profile", me.caseId ?? me.email, true, "users"));
    flash("Profile saved");
    return OK;
  };
}

export interface ClientProfileInput {
  name: string;
  preferred: string;
}
export interface ClientContactInput {
  phone: string;
  address: string;
  contactPref: string;
}

export function saveClientProfile(input: ClientProfileInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const me = selectMe(getState());
    if (me.role !== "CLIENT") return fail("Only clients can edit this profile.");
    if (!input.name.trim()) return fail("Enter your full name.");
    dispatch(workspaceActions.patched({ key: "users", id: me.id, patch: { name: input.name.trim(), preferred: input.preferred.trim() } }));
    dispatch(audit("Updated own profile", me.caseId ?? "", true, "users"));
    flash("Saved in this demo session");
    return OK;
  };
}

export function saveClientContact(input: ClientContactInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const me = selectMe(getState());
    if (me.role !== "CLIENT") return fail("Only clients can edit contact details.");
    const phone = input.phone.trim();
    if (phone && !/^[+()\d\s-]{7,20}$/.test(phone)) {
      return fail("Enter a phone number using digits, spaces, +, - or brackets.");
    }
    dispatch(
      workspaceActions.patched({
        key: "users",
        id: me.id,
        patch: { phone, address: input.address.trim(), contactPref: input.contactPref },
      }),
    );
    dispatch(audit("Updated own contact information", me.caseId ?? "", true, "users"));
    flash("Saved in this demo session");
    return OK;
  };
}

export function toggleNotificationPref(category: keyof NotificationPrefs, channel: "email" | "app"): AppThunk {
  return (dispatch, getState) => {
    const me = selectMe(getState());
    if (!me.prefs) return;
    const prefs: NotificationPrefs = structuredClone(me.prefs);
    prefs[category][channel] = !prefs[category][channel];
    dispatch(workspaceActions.patched({ key: "users", id: me.id, patch: { prefs } }));
  };
}

export function changePassword(current: string, next: string, confirm: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    if (!current) return fail("Enter your current password.");
    if (next.length < 12 || !/[A-Z]/.test(next) || !/[0-9]/.test(next)) {
      return fail("Use at least 12 characters with an uppercase letter and a number.");
    }
    if (next !== confirm) return fail("The new passwords don't match.");
    dispatch(audit("Password change (simulated)", selectMe(getState()).caseId ?? "", true, "auth"));
    flash("Simulated: no password was changed. Production verifies your current password on the server.");
    return OK;
  };
}
