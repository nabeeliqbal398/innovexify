import { projectOfClient, userById } from "@/store/selectors";
import type { DemoData, FollowUp, User } from "@/types/domain";

/** Five onboarding milestones; the label reads "3/5". */
export function onboarding(data: DemoData, client: User): { n: number; pct: number; label: string } {
  const project = projectOfClient(data, client.id);
  const steps = [
    client.status === "Active",
    Boolean(client.phone || client.address),
    Boolean(project),
    Boolean(project && project.stageIdx >= 4),
    !data.docs.some((d) => d.client === client.id && ["requested", "rejected", "info"].includes(d.status)),
  ];
  const n = steps.filter(Boolean).length;
  return { n, pct: Math.round((n / steps.length) * 100), label: `${n}/${steps.length}` };
}

/** Latest time staff reached the client: a staff message, a recorded interaction or a completed follow-up. */
export function lastContact(data: DemoData, client: User): number {
  let t = 0;
  (data.msgs[client.id] ?? []).forEach((m) => {
    const sender = userById(data, m.from);
    if (sender && sender.role !== "CLIENT" && (m.at ?? 0) > t) t = m.at ?? 0;
  });
  data.interactions.forEach((i) => {
    if (i.client === client.id && i.at > t) t = i.at;
  });
  data.followups.forEach((f) => {
    if (f.client === client.id && (f.doneAt ?? 0) > t) t = f.doneAt ?? 0;
  });
  return t;
}

export function nextFollowup(data: DemoData, client: User): FollowUp | undefined {
  return data.followups.filter((f) => f.client === client.id && f.status === "Open").sort((a, b) => (a.due < b.due ? -1 : 1))[0];
}
