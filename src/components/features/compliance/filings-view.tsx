"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { FilingDialog, type FilingTarget } from "@/components/features/compliance/filing-dialog";
import { useOpenCase } from "@/components/features/compliance/use-open-case";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Callout, PageHeader } from "@/components/ui/primitives";
import { FILING_STATUSES, FILING_TONE } from "@/constants/vocab";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useStore";
import { FILING_STATUS } from "@/lib/api-mappers";
import { cn } from "@/lib/cn";
import { ago, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useFilingCountQuery, useFilingsQuery } from "@/store/api/filings";
import type { FilingStatus } from "@/types/domain";

const PAGE_SIZE = 10;

function StatusTile({ status }: { status: FilingStatus }) {
  const { data } = useFilingCountQuery(FILING_STATUS.toKey(status));
  return (
    <div className="kpi">
      <Badge tone={FILING_TONE[status]} className="self-start">
        {status}
      </Badge>
      <span className="text-[26px] font-semibold leading-tight tabular-nums">{data ?? "…"}</span>
    </div>
  );
}

/** State & filing tracker: a manual record of what was filed, when, and what happens next. */
export function FilingsView({ nav }: ViewProps) {
  const me = useMe();
  const openCase = useOpenCase(nav);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FilingTarget>(null);
  const canEdit = can(me, "filingTracker");
  const search = useDebounced(query.trim(), 300);

  const result = useFilingsQuery({ search, status: status ? FILING_STATUS.toKey(status) : undefined, sort: "number", order: "desc", page, limit: PAGE_SIZE });
  const rows = result.data?.items ?? [];
  const meta = result.data?.meta;

  return (
    <div className="stack-16">
      <PageHeader
        title="State & filing tracker"
        description="A manual record of what was filed, when, and what happens next."
        actions={
          canEdit ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Icon name="plus" small />
              Add filing
            </Button>
          ) : null
        }
      />
      <Callout tone="info" icon="flag">
        Manual tracker. It is not connected to any state government system; statuses and reference numbers are entered by staff.
      </Callout>
      <section className="kpis" aria-label="Filings by status">
        {FILING_STATUSES.map((s) => (
          <StatusTile key={s} status={s} />
        ))}
      </section>
      <section className="card overflow-hidden">
        <div className="card-h">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              type="search"
              aria-label="Search filings"
              placeholder="Search client, case, filing type or reference"
              className="max-w-[320px] flex-1"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <Select
              aria-label="Filter by filing status"
              className="w-auto"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {FILING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <QueryState query={result} isEmpty={rows.length === 0} empty={{ title: "No filings match", text: "Clear the search or add a filing from a case." }}>
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
                {rows.map((f) => (
                  <tr key={f.id} className="border-b border-muted">
                    <td className="tl-left px-3 py-2.5">
                      <button type="button" className="linkb" onClick={() => openCase(f.caseId, "filings")}>
                        {f.clientName}
                      </button>
                      <div className="help mono">
                        {f.display} · {f.project}
                      </div>
                    </td>
                    <td data-label="State" className="px-3 py-2.5">
                      {f.state || "—"}
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
                    <td data-label="Next action" className={cn("px-3 py-2.5 text-sm", f.late && "font-semibold text-danger-hover")}>
                      {f.next || "—"}
                      <div className="help">{f.nextDate ? fmtDay(f.nextDate) : ""}</div>
                    </td>
                    <td data-label="Last update" className="help whitespace-nowrap px-3 py-2.5">
                      {ago(f.updated)}
                    </td>
                    <td data-label="Actions" className="px-3 py-2.5">
                      {canEdit ? (
                        <Button size="sm" onClick={() => setEditing(f)}>
                          Update
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta ? (
            <Pager
              page={meta.page - 1}
              pageCount={meta.totalPages}
              total={meta.total}
              pageSize={PAGE_SIZE}
              noun="filings"
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : null}
        </QueryState>
      </section>
      <FilingDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
