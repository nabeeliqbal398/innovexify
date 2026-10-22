import { DOC_STATUS, ROLE_LABEL, type BadgeTone } from "@/constants/vocab";
import { fmtAt } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { userById } from "@/store/selectors";
import type { DemoData, Project, Role, User } from "@/types/domain";

/** Admin and Manager open cases from Case management; CSR and Compliance open them from Clients. */
export function caseViewFor(role: Role): "cases" | "clients" {
  return role === "ADMIN" || role === "MANAGER" ? "cases" : "clients";
}

export const isDone = (p: Project): boolean => p.stageIdx >= 10 || p.status === "Completed";

export function serviceName(data: DemoData, id: string): string {
  return data.services.find((s) => s.id === id)?.name ?? "—";
}

/** Cases whose client the signed-in user is allowed to open. */
export function scopedProjects(data: DemoData, me: User): Project[] {
  return data.projects.filter((p) => {
    const client = userById(data, p.client);
    return Boolean(client) && client?.status !== "Removed" && me.role !== "CLIENT" && can(me, "viewClient", client);
  });
}

export function clientUsers(data: DemoData): User[] {
  return data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed");
}

export interface TimelineEntry {
  id: string;
  kind: string;
  tone: BadgeTone;
  dot: string;
  text: string;
  note: string;
  who: string;
  role: string;
  time: string;
  at: number;
}

/** One timeline for a client's case, filtered by what the viewer may see. */
export function buildTimeline(data: DemoData, project: Project, viewer: Role, relationship: boolean): TimelineEntry[] {
  const client = userById(data, project.client);
  const out: TimelineEntry[] = [];
  const person = (id?: string | null) => {
    const u = userById(data, id);
    return { who: u?.name ?? "—", role: u ? ROLE_LABEL[u.role] : "" };
  };

  project.events.forEach((e, i) => {
    out.push({
      id: `case-${i}`,
      kind: "Case",
      tone: "brand",
      dot: "bg-primary",
      text: e.to ? `Stage → ${e.to}` : e.note,
      note: e.to ? e.note : "",
      ...person(e.by),
      time: fmtAt(e.at),
      at: e.at,
    });
  });
  data.docs
    .filter((d) => d.client === project.client)
    .forEach((d) => {
      d.history.forEach((h, i) => {
        const showNote = viewer !== "CSR" && Boolean(h.note) && h.status !== "submitted";
        out.push({
          id: `doc-${d.id}-${i}`,
          kind: "Document",
          tone: "violet",
          dot: "bg-violet",
          text: `${d.name}: ${DOC_STATUS[h.status].label}`,
          note: showNote ? h.note : "",
          ...person(h.by),
          time: fmtAt(h.at),
          at: h.at,
        });
      });
    });
  data.tickets
    .filter((t) => t.client === project.client)
    .forEach((t) => {
      out.push({
        id: `ticket-${t.id}`,
        kind: "Ticket",
        tone: "warn",
        dot: "bg-warning",
        text: `${t.id} · ${t.title} (${t.status})`,
        note: "",
        who: person(t.client).who,
        role: "Client",
        time: t.created,
        at: t.createdAt || 0,
      });
    });
  (data.msgs[project.client] ?? []).forEach((m, i) => {
    out.push({
      id: `msg-${i}`,
      kind: "Message",
      tone: "info",
      dot: "bg-info",
      text: m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text,
      note: "",
      ...person(m.from),
      time: m.time,
      at: m.at ?? 0,
    });
  });
  if (relationship) {
    data.interactions
      .filter((x) => x.client === project.client)
      .forEach((x) => {
        out.push({
          id: `int-${x.id}`,
          kind: x.kind,
          tone: "teal",
          dot: "bg-teal",
          text: x.text,
          note: "",
          ...person(x.by),
          time: fmtAt(x.at),
          at: x.at,
        });
      });
    data.followups
      .filter((f) => f.client === project.client && f.status === "Done")
      .forEach((f) => {
        out.push({
          id: `fu-${f.id}`,
          kind: "Follow-up",
          tone: "ok",
          dot: "bg-success",
          text: `${f.type} completed: ${f.outcome || f.note}`,
          note: "",
          ...person(f.csr),
          time: fmtAt(f.doneAt),
          at: f.doneAt ?? 0,
        });
      });
    if (client) {
      out.push({
        id: "invitation",
        kind: "Invitation",
        tone: "q",
        dot: "bg-neutral",
        text: client.status === "Invited" ? "Invitation sent, not accepted yet" : `Invitation accepted · account ${client.status.toLowerCase()}`,
        note: "",
        who: client.name,
        role: "Client",
        time: client.joinedAt ? fmtAt(client.joinedAt) : "",
        at: client.joinedAt ?? 0,
      });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}
