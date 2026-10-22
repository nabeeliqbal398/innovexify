import type { RootState } from "@/store";
import type { DemoData, Project, User } from "@/types/domain";

export const selectData = (s: RootState): DemoData => s.workspace.data;
export const selectMeId = (s: RootState): string => s.workspace.meId;
export const selectDenied = (s: RootState) => s.workspace.denied;
export const selectLocked = (s: RootState): string | null => s.workspace.lockedUid;

export function selectMe(s: RootState): User {
  const { data, meId } = s.workspace;
  return data.users.find((u) => u.id === meId) as User;
}

export function userById(data: DemoData, id?: string | null): User | undefined {
  return id ? data.users.find((u) => u.id === id) : undefined;
}

export function userName(data: DemoData, id?: string | null): string {
  return userById(data, id)?.name ?? "—";
}

export function projectOfClient(data: DemoData, clientId: string): Project | undefined {
  return data.projects.find((p) => p.client === clientId);
}

export function projectById(data: DemoData, id?: string): Project | undefined {
  return id ? data.projects.find((p) => p.id === id) : undefined;
}

/** Active staff ids in the given roles, plus an optional extra id. */
export function staffIds(data: DemoData, roles: string[], extra?: string | null): string[] {
  const ids = data.users.filter((u) => u.status === "Active" && roles.includes(u.role)).map((u) => u.id);
  return extra ? [...ids, extra] : ids;
}

/** Everyone who works a client's case: admin, manager, compliance, plus the assigned CSR. */
export function teamFor(data: DemoData, clientId: string): string[] {
  const client = userById(data, clientId);
  return staffIds(data, ["ADMIN", "MANAGER", "COMPLIANCE"], client?.csr);
}
