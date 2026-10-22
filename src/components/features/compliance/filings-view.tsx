"use client";

import { useState } from "react";

import { FilingDialog } from "@/components/features/compliance/filing-dialog";
import { useOpenCase } from "@/components/features/compliance/use-open-case";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Callout, EmptyState, PageHeader } from "@/components/ui/primitives";
import { FILING_STATUSES, FILING_TONE } from "@/constants/vocab";
import { ago, dISO, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { openFilingEditor } from "@/store/actions/cases";
import { projectById, userById } from "@/store/selectors";

/** State & filing tracker: a manual record of what was filed, when, and what happens next. */
export function FilingsView({ nav }: ViewProps) {
  const dispatch = useAppDispatch();
  const data = useData();
  const me = useMe();
  const openCase = useOpenCase(nav);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const canEdit = can(me, "filingTracker");
  const today = dISO(0);

  const open = (id: string) => {
    if (dispatch(openFilingEditor())) setEditing(id);
  };

  const q = query.trim().toLowerCase();
  const rows = data.filings
    .map((f) => {
      const project = projectById(data, f.project);
      return { f, project, client: userById(data, project?.client) };
    })
    .filter(
      ({ f, client }) =>
        client &&
        (!q || `${client.name} ${client.caseId} ${f.type} ${f.ref} ${client.state ?? ""}`.toLowerCase().includes(q)) &&
        (!status || f.status === status),
    )
    .sort((a, b) => b.f.updated - a.f.updated);

  return (
    <div className="stack-16">
      <PageHeader
        title="State & filing tracker"
        description="A manual record of what was filed, when, and what happens next."
        actions={
          canEdit ? (
            <Button variant="primary" onClick={() => open("")}>
              <Icon name="plus" small />
              Add filing
            </Button>
          ) : null
        }
      />
      <Callout tone="info" icon="flag">
        Manual demo tracker. It is not connected to any state government system; statuses and reference numbers are entered by staff.
      </Callout>
      <section className="kpis" aria-label="Filings by status">
        {FILING_STATUSES.map((s) => (
          <div key={s} className="kpi">
            <Badge tone={FILING_TONE[s]} className="self-start">
              {s}
            </Badge>
            <span className="text-[26px] font-semibold leading-tight tabular-nums">{data.filings.filter((f) => f.status === s).length}</span>
          </div>
        ))}
      </section>
      <section className="card overflow-hidden">
        <div className="card-h">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              type="search"
              aria-label="Search filings"
              placeholder="Search client, case, state or reference"
              className="max-w-[320px] flex-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select aria-label="Filter by filing status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {FILING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="data stack min-w-[1100px]">
            <thead>
              <tr>
                <th scope="col">Client &amp; case</th>
                <th scope="col">State</th>
                <th scope="col">Filing type</th>
                <th scope="col">Submitted</th>
                <th scope="col">Status</th>
                <th scope="col">Reference no.</th>
                <th scope="col">Next action</th>
                <th scope="col">Last update</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ f, project, client }) => {
                const late = Boolean(f.nextDate) && f.nextDate < today && f.status !== "Approved";
                return (
                  <tr key={f.id} className="border-b border-muted">
                    <td className="tl-left px-3 py-2.5">
                      <button type="button" className="linkb" onClick={() => project && openCase(project.id, "filings")}>
                        {client?.name}
                      </button>
                      <div className="help mono">
                        {client?.caseId} · {project?.id}
                      </div>
                    </td>
                    <td data-label="State" className="px-3 py-2.5">
                      {client?.state || "—"}
                    </td>
                    <td data-label="Filing type" className="px-3 py-2.5 text-sm">
                      {f.type}
                    </td>
                    <td data-label="Submitted" className="whitespace-nowrap px-3 py-2.5 text-sm">
                      {f.submitted ? fmtDay(f.submitted) : "Not submitted"}
                    </td>
                    <td data-label="Status" className="px-3 py-2.5">
                      <Badge tone={FILING_TONE[f.status]}>{f.status}</Badge>
                    </td>
                    <td data-label="Reference no." className="mono px-3 py-2.5 text-xs">
                      {f.ref || "—"}
                    </td>
                    <td data-label="Next action" className={cn("px-3 py-2.5 text-sm", late && "font-semibold text-danger-hover")}>
                      {f.next || "—"}
                      <div className="help">{f.nextDate ? fmtDay(f.nextDate) : ""}</div>
                    </td>
                    <td data-label="Last update" className="help whitespace-nowrap px-3 py-2.5">
                      {ago(f.updated)}
                    </td>
                    <td data-label="Actions" className="px-3 py-2.5">
                      {canEdit ? (
                        <Button size="sm" onClick={() => open(f.id)}>
                          Update
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <EmptyState title="No filings match" text="Clear the search or add a filing from a case." /> : null}
      </section>
      <FilingDialog filingId={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
