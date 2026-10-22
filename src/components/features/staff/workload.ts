import { dISO } from "@/lib/dates";
import type { DemoData, Project, User, UserStatus } from "@/types/domain";

const DAY = 86_400_000;

export interface Workload {
  clients: number;
  cases: number;
  tasks: number;
  overdue: number;
  followups: number;
  tickets: number;
  reviews: number;
}

export function isFinished(project: Project): boolean {
  return project.stageIdx >= 10 || project.status === "Completed";
}

/** Counts of what a staff member currently carries, derived from the shared data. */
export function workloadOf(data: DemoData, user: User): Workload {
  const today = dISO(0);
  const clients = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed" && u.csr === user.id);
  const openTasks = data.tasks.filter((t) => t.assignee === user.id && !t.done);
  const clientCases = clients.filter((c) => {
    const project = data.projects.find((p) => p.client === c.id);
    return project && !isFinished(project);
  }).length;
  const ownedCases = data.projects.filter((p) => p.owner === user.id && !isFinished(p)).length;
  return {
    clients: clients.length,
    cases: clientCases + ownedCases,
    tasks: openTasks.length,
    overdue: openTasks.filter((t) => t.due && t.due < today).length,
    followups: data.followups.filter((f) => f.csr === user.id && f.status === "Open").length,
    tickets: data.tickets.filter((t) => t.handler === user.id && t.status !== "Resolved" && t.status !== "Closed").length,
    reviews: data.docs.filter((d) => d.reviewedBy === user.id && (d.reviewedAt ?? 0) > Date.now() - 30 * DAY).length,
  };
}

/** Invitations the signed-in user can see: CSRs only see clients they invited or are assigned to. */
export function pendingInvitations(data: DemoData, me: User): User[] {
  return data.users.filter(
    (u) =>
      u.status === "Invited" &&
      (me.role !== "CSR" || (u.role === "CLIENT" && (u.csr === me.id || u.invitedBy === me.id || !u.csr))),
  );
}

export function statusTone(status: UserStatus): "ok" | "brand" | "err" {
  if (status === "Active") return "ok";
  return status === "Invited" ? "brand" : "err";
}
