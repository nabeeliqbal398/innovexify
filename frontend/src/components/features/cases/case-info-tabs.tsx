"use client";

import { ErrorState, QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState, Facts } from "@/components/ui/primitives";
import { DOC_STATUS, ROLE_LABEL } from "@/constants/vocab";
import { useMe } from "@/hooks/useStore";
import { ago, fmtAt, fmtDay, relDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useCaseDocumentsQuery, useClientTimelineQuery, useOpenTicketCountQuery } from "@/store/api/cases";
import { useAuditQuery } from "@/store/api/system";
import type { Project, User } from "@/types/domain";
import { ActivityTimeline } from "./activity-timeline";
import { isDone } from "./case-data";

interface TabProps {
  project: Project;
  client: User;
}

const todayUtc = (): string => new Date().toISOString().slice(0, 10);

export function OverviewTab({ project, client }: TabProps) {
  const docs = useCaseDocumentsQuery(client.id);
  const tickets = useOpenTicketCountQuery(client.id);
  const overdue = Boolean(project.deadline) && project.deadline < todayUtc() && !isDone(project);
  const outstanding = (docs.data ?? []).filter((d) => ["requested", "rejected", "info"].includes(d.status));
  const target = project.deadline ? `${fmtDay(project.deadline)} · ${relDay(project.deadline)}` : "Not set";
  const facts = [
    { label: "Client", value: `${client.name} · ${client.email}` },
    { label: "Business", value: client.biz || "Business name to be confirmed" },
    { label: "Formation state", value: client.state || "State not chosen" },
    { label: "Service", value: project.serviceName },
    { label: "Assigned CSR", value: client.csrName ?? "Unassigned" },
    { label: "Compliance owner", value: project.ownerName ?? "Not assigned" },
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
        <CardHeader title="Outstanding information" aside={<span className="help">{tickets.data ?? "…"} open tickets</span>} />
        <QueryState query={docs} isEmpty={outstanding.length === 0} empty={{ title: "Nothing outstanding", text: "No open document requests for this client." }} rows={2}>
          {outstanding.map((d) => (
            <div key={d.id} className="row">
              <span className="flex-1 text-sm">{d.name}</span>
              <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
            </div>
          ))}
        </QueryState>
      </Card>
    </div>
  );
}

export function TimelineTab({ client }: TabProps) {
  const me = useMe();
  const relationship = me.role === "CSR" || me.role === "ADMIN" || me.role === "MANAGER";
  const result = useClientTimelineQuery({ clientId: client.id, relationship, limit: 40 });
  return (
    <section className="card card-b">
      <QueryState query={result} isEmpty={(result.data ?? []).length === 0} empty={{ title: "No activity yet" }} rows={4}>
        <ActivityTimeline entries={result.data ?? []} />
      </QueryState>
    </section>
  );
}

/** The audit entries about this case. The audit log is Admin's, so other roles do not get this tab. */
export function ActivityTab({ project, client }: TabProps) {
  const me = useMe();
  const allowed = can(me, "auditLog");
  const byCase = useAuditQuery({ search: project.id, limit: 25 }, { skip: !allowed });
  const byClient = useAuditQuery({ search: client.caseId ?? "", limit: 25 }, { skip: !allowed || !client.caseId });
  if (!allowed) return <EmptyState title="Not available" text="The audit log is limited to Admin." />;
  if (byCase.isError) return <ErrorState error={byCase.error} onRetry={() => void byCase.refetch()} />;
  const seen = new Set<string>();
  const entries = [...(byCase.data?.items ?? []), ...(byClient.data?.items ?? [])]
    .filter((a) => (a.id && !seen.has(a.id) ? (seen.add(a.id), true) : false))
    .sort((a, b) => b.at - a.at)
    .slice(0, 25);

  return (
    <Card>
      <QueryState
        query={{ isLoading: byCase.isLoading || byClient.isLoading, isError: false, refetch: () => undefined }}
        isEmpty={entries.length === 0}
        empty={{ title: "No audit entries for this case yet" }}
        rows={3}
      >
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
              {entries.map((a) => (
                <tr key={a.id}>
                  <td data-label="When" className="help whitespace-nowrap">
                    {fmtAt(a.at)}
                  </td>
                  <td data-label="Actor" className="whitespace-nowrap">
                    {a.actorName ?? "—"} <span className="help">· {a.role ? ROLE_LABEL[a.role] : ""}</span>
                  </td>
                  <td data-label="Action" className="text-sm">
                    {a.action}
                  </td>
                  <td data-label="Result">
                    <Badge tone={a.ok ? "ok" : "err"}>{a.ok ? "Allowed" : "Refused"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </Card>
  );
}
