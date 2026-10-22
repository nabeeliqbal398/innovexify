"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState, Facts } from "@/components/ui/primitives";
import { DOC_STATUS, ROLE_LABEL } from "@/constants/vocab";
import { useData, useMe } from "@/hooks/useStore";
import { ago, dISO, fmtAt, fmtDay, relDay } from "@/lib/dates";
import { userById, userName } from "@/store/selectors";
import type { Project, User } from "@/types/domain";
import { ActivityTimeline } from "./activity-timeline";
import { buildTimeline, isDone, serviceName } from "./case-data";

interface TabProps {
  project: Project;
  client: User;
}

export function OverviewTab({ project, client }: TabProps) {
  const data = useData();
  const overdue = Boolean(project.deadline) && project.deadline < dISO(0) && !isDone(project);
  const outstanding = data.docs.filter((d) => d.client === client.id && ["requested", "rejected", "info"].includes(d.status));
  const openTickets = data.tickets.filter((t) => t.client === client.id && t.status !== "Resolved" && t.status !== "Closed").length;
  const target = project.deadline ? `${fmtDay(project.deadline)} · ${relDay(project.deadline)}` : "Not set";
  const facts = [
    { label: "Client", value: `${client.name} · ${client.email}` },
    { label: "Business", value: client.biz || "Business name to be confirmed" },
    { label: "Formation state", value: client.state || "State not chosen" },
    { label: "Service", value: serviceName(data, project.service) },
    { label: "Assigned CSR", value: userName(data, client.csr) === "—" ? "Unassigned" : userName(data, client.csr) },
    { label: "Compliance owner", value: project.owner ? userName(data, project.owner) : "Not assigned" },
    { label: "Target date", value: <span className={overdue ? "font-semibold text-danger-hover" : ""}>{target}</span> },
    { label: "Opened", value: fmtAt(project.createdAt) },
    { label: "Last activity", value: ago(project.last) },
    { label: "State confirmation", value: project.filing || "Not recorded" },
  ];

  return (
    <div className="grid2">
      <section className="card card-b">
        <span className="h3">Case details</span>
        <Facts items={facts} />
      </section>
      <Card>
        <CardHeader title="Outstanding information" aside={<span className="help">{openTickets} open tickets</span>} />
        {outstanding.map((d) => (
          <div key={d.id} className="row">
            <span className="flex-1 text-sm">{d.name}</span>
            <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
          </div>
        ))}
        {outstanding.length === 0 ? <EmptyState title="Nothing outstanding" text="No open document requests for this client." /> : null}
      </Card>
    </div>
  );
}

export function TimelineTab({ project }: TabProps) {
  const data = useData();
  const me = useMe();
  const entries = buildTimeline(data, project, me.role, me.role === "CSR" || me.role === "ADMIN" || me.role === "MANAGER").slice(0, 40);
  return (
    <section className="card card-b">
      <ActivityTimeline entries={entries} />
      {entries.length === 0 ? <EmptyState title="No activity yet" /> : null}
    </section>
  );
}

export function ActivityTab({ project, client }: TabProps) {
  const data = useData();
  const entries = data.audit.filter((a) => a.target === client.caseId || a.action.includes(project.id)).slice(0, 25);
  return (
    <Card>
      <div className="tbl-wrap">
        <table className="data stack min-w-[720px]">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((a, i) => {
              const role = a.role ?? userById(data, a.actor)?.role;
              return (
                <tr key={`${a.at}-${i}`}>
                  <td data-label="When" className="help whitespace-nowrap">
                    {a.at ? fmtAt(a.at) : a.time}
                  </td>
                  <td data-label="Actor" className="whitespace-nowrap">
                    {userName(data, a.actor)} <span className="help">· {role ? ROLE_LABEL[role] : ""}</span>
                  </td>
                  <td data-label="Action" className="text-sm">
                    {a.action}
                  </td>
                  <td data-label="Result">
                    <Badge tone={a.ok ? "ok" : "err"}>{a.ok ? "Allowed" : "Refused"}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {entries.length === 0 ? <EmptyState title="No audit entries for this case yet" /> : null}
    </Card>
  );
}
