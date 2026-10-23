"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, PageHeader } from "@/components/ui/primitives";
import { CASE_STATUSES, CASE_TONE, FORMATION_STATES, PRIORITIES, PRIORITY_TONE, STAGES } from "@/constants/vocab";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useStore";
import { ago, fmtDay } from "@/lib/dates";
import { CASE_STAGE, CASE_STATUS, PRIORITY } from "@/lib/api-mappers";
import { can } from "@/lib/permissions";
import { useCasesQuery } from "@/store/api/cases";
import { useDirectoryQuery } from "@/store/api/people";
import type { ViewProps } from "@/components/features/workspace/types";
import { caseViewFor, isDone } from "./case-data";
import { NewCaseDialog } from "./new-case-dialog";

const PAGE_SIZE = 8;
const FILTER_KEYS = ["stage", "status", "csr", "state", "priority", "date"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type SortKey = "id" | "client" | "csr" | "state" | "stage" | "status" | "priority" | "deadline" | "last";

const COLUMNS: ReadonlyArray<readonly [SortKey, string]> = [
  ["id", "Case ID"],
  ["client", "Client"],
  ["csr", "CSR"],
  ["state", "State"],
  ["stage", "Stage"],
  ["status", "Status"],
  ["priority", "Priority"],
  ["deadline", "Target date"],
  ["last", "Last activity"],
];
/** What the server sorts by for each column. The CSR column is not sortable (the server has no such sort). */
const SERVER_SORT: Partial<Record<SortKey, string>> = {
  id: "number",
  client: "clientName",
  state: "formationState",
  stage: "stage",
  status: "status",
  priority: "priority",
  deadline: "deadline",
  last: "lastActivityAt",
};
const SORT_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["last:-1", "Sort: last activity, newest"],
  ["deadline:1", "Sort: target date, soonest"],
  ["priority:-1", "Sort: priority, highest"],
  ["stage:1", "Sort: stage, earliest"],
  ["client:1", "Sort: client A–Z"],
  ["id:1", "Sort: case ID"],
];

/** Dates in UTC, as the server reckons them. */
const utcDay = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** A link may carry a label ("Documents Pending") or an API key (DOCUMENTS_PENDING); the server wants the key. */
const asKey = (map: { toKey: (l: string) => string }, value: string): string | undefined => (value ? map.toKey(value) : undefined);

export function CasesView({ nav }: ViewProps) {
  const me = useMe();
  const [q, setQ] = useState(nav.param("q"));
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "last", dir: -1 });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(nav.param("new") === "1");
  const search = useDebounced(q.trim(), 300);

  const filters: Record<FilterKey, string> = {
    stage: nav.param("stage"),
    status: nav.param("status"),
    csr: nav.param("csr"),
    state: nav.param("state"),
    priority: nav.param("priority"),
    date: nav.param("date"),
  };

  const csrs = useDirectoryQuery({ role: "CSR" });
  const result = useCasesQuery({
    search,
    stage: asKey(CASE_STAGE, filters.stage),
    status: asKey(CASE_STATUS, filters.status),
    priority: asKey(PRIORITY, filters.priority),
    csrId: filters.csr || undefined,
    state: filters.state || undefined,
    overdue: filters.date === "overdue" ? true : undefined,
    deadlineFrom: filters.date === "week" ? utcDay(0) : undefined,
    deadlineTo: filters.date === "week" ? utcDay(7) : undefined,
    openedFrom: filters.date === "30" ? utcDay(-30) : filters.date === "90" ? utcDay(-90) : undefined,
    sort: SERVER_SORT[sort.key],
    order: sort.dir === 1 ? "asc" : "desc",
    page,
    limit: PAGE_SIZE,
  });
  const rows = result.data?.items ?? [];
  const meta = result.data?.meta;
  const activeFilters = FILTER_KEYS.filter((k) => filters[k]).length + (search ? 1 : 0);

  const setFilter = (key: FilterKey, value: string) => {
    nav.setParams({ [key]: value || undefined });
    setPage(1);
  };
  const clearAll = () => {
    nav.setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])));
    setQ("");
    setPage(1);
  };
  const pickSort = (key: SortKey) => {
    if (!SERVER_SORT[key]) return;
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
    setPage(1);
  };
  const open = (apiId: string) => nav.go(caseViewFor(me.role), { id: apiId });

  const filterSelect = (key: FilterKey, label: string, all: string, options: ReadonlyArray<{ value: string; label: string }>) => (
    <Select aria-label={label} className="w-auto min-w-0 flex-[0_1_auto]" value={filters[key]} onChange={(e) => setFilter(key, e.target.value)}>
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
  const plain = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));

  return (
    <div className="stack-16">
      <PageHeader
        title="Case management"
        description="Every formation and service case. Stage shows where the work is; status shows whether it's moving."
        actions={
          can(me, "editCase") ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Icon name="plus" small />
              New case
            </Button>
          ) : null
        }
      />
      <Card>
        <div className="card-h gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              type="search"
              aria-label="Search cases"
              placeholder="Search case, client, business or service"
              className="max-w-[320px] flex-[1_1_220px]"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            {filterSelect("stage", "Filter by stage", "All stages", plain(STAGES))}
            {filterSelect("status", "Filter by status", "All statuses", plain(CASE_STATUSES))}
            <Select aria-label="Filter by CSR" className="w-auto min-w-0 flex-[0_1_auto]" value={filters.csr} onChange={(e) => setFilter("csr", e.target.value)}>
              <option value="">All CSRs</option>
              <option value="none">No CSR</option>
              {(csrs.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {filterSelect("state", "Filter by formation state", "All states", plain(FORMATION_STATES))}
            {filterSelect("priority", "Filter by priority", "All priorities", plain(PRIORITIES))}
            <Select
              aria-label="Sort cases"
              className="w-auto min-w-0 flex-[0_1_auto]"
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":");
                setSort({ key: key as SortKey, dir: dir === "1" ? 1 : -1 });
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
            {filterSelect("date", "Filter by date", "Any date", [
              { value: "overdue", label: "Target date passed" },
              { value: "week", label: "Target date this week" },
              { value: "30", label: "Opened in last 30 days" },
              { value: "90", label: "Opened in last 90 days" },
            ])}
            {activeFilters > 0 ? (
              <Button size="sm" variant="ghost" onClick={clearAll}>
                Clear filters ({activeFilters})
              </Button>
            ) : null}
          </div>
        </div>
        <QueryState
          query={result}
          isEmpty={rows.length === 0}
          empty={{ title: "No cases match these filters", text: "Clear a filter or search for a client name or case ID." }}
          rows={6}
        >
          <div className="tbl-wrap">
            <table className="data stack min-w-[1160px]">
              <thead>
                <tr>
                  {COLUMNS.map(([key, label]) => {
                    const on = sort.key === key;
                    return (
                      <th key={key} scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                        {SERVER_SORT[key] ? (
                          <button type="button" className="sortb" onClick={() => pickSort(key)}>
                            {label}
                            {on ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const overdue = Boolean(p.deadline) && p.deadline < utcDay(0) && !isDone(p);
                  return (
                    <tr key={p.apiId}>
                      <td className="tl-left">
                        <button type="button" className="linkb mono" aria-label={`Open case ${p.id} for ${p.clientName}`} onClick={() => open(p.apiId)}>
                          {p.clientCaseId}
                        </button>
                        <div className="help mono">
                          {p.id} · {p.serviceName}
                        </div>
                      </td>
                      <td data-label="Client">
                        <div className="font-medium">{p.clientName}</div>
                        <div className="help">{p.biz || "—"}</div>
                      </td>
                      <td data-label="CSR" className="whitespace-nowrap">
                        {p.csrName ?? "Unassigned"}
                      </td>
                      <td data-label="State">{p.state || "—"}</td>
                      <td data-label="Stage" className="text-sm">
                        {STAGES[p.stageIdx]}
                      </td>
                      <td data-label="Status">
                        <Badge tone={CASE_TONE[p.status] ?? "q"}>{p.status}</Badge>
                      </td>
                      <td data-label="Priority">
                        <Badge tone={PRIORITY_TONE[p.priority] ?? "q"}>{p.priority || "Normal"}</Badge>
                      </td>
                      <td data-label="Target date" className={`whitespace-nowrap text-sm ${overdue ? "font-semibold text-danger-hover" : ""}`}>
                        {p.deadline ? fmtDay(p.deadline) : "—"}
                        {overdue ? <div className="help text-danger-hover">Overdue</div> : null}
                      </td>
                      <td data-label="Last activity" className="help whitespace-nowrap">
                        {ago(p.last || p.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </QueryState>
        {meta ? (
          <Pager
            page={meta.page - 1}
            pageCount={meta.totalPages}
            total={meta.total}
            pageSize={PAGE_SIZE}
            noun="cases"
            onPrev={() => setPage(Math.max(1, page - 1))}
            onNext={() => setPage(page + 1)}
          />
        ) : null}
      </Card>
      {creating ? <NewCaseDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
