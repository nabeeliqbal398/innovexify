"use client";

import { useMemo, useState } from "react";

import { Pager } from "@/components/common/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { CASE_STATUSES, CASE_TONE, PRIORITIES, PRIORITY_TONE, STAGES } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { ago, daysFromToday, dISO, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { openCaseCheck } from "@/store/actions/cases";
import { userById } from "@/store/selectors";
import type { Project } from "@/types/domain";
import type { ViewProps } from "@/components/features/workspace/types";
import { caseViewFor, isDone, scopedProjects, serviceName } from "./case-data";
import { NewCaseDialog } from "./new-case-dialog";

const PAGE_SIZE = 8;
const DAY = 86_400_000;
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
const SORT_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["last:-1", "Sort: last activity, newest"],
  ["deadline:1", "Sort: target date, soonest"],
  ["priority:-1", "Sort: priority, highest"],
  ["stage:1", "Sort: stage, earliest"],
  ["client:1", "Sort: client A–Z"],
  ["id:1", "Sort: case ID"],
];

export function CasesView({ nav }: ViewProps) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [q, setQ] = useState(nav.param("q"));
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "last", dir: -1 });
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(nav.param("new") === "1");

  const filters: Record<FilterKey, string> = {
    stage: nav.param("stage"),
    status: nav.param("status"),
    csr: nav.param("csr"),
    state: nav.param("state"),
    priority: nav.param("priority"),
    date: nav.param("date"),
  };
  const query = q.trim().toLowerCase();
  const todayIso = dISO(0);

  const scoped = useMemo(() => scopedProjects(data, me), [data, me]);
  const csrs = data.users.filter((u) => u.role === "CSR" && u.status === "Active");
  const states = [...new Set(data.users.filter((u) => u.role === "CLIENT").map((u) => u.state).filter((s): s is string => Boolean(s)))].sort();

  const lastAt = (p: Project) => p.last || p.createdAt || 0;
  const sortValue = (p: Project, key: SortKey): string | number => {
    const client = userById(data, p.client);
    switch (key) {
      case "id":
        return client?.caseId ?? "";
      case "client":
        return client?.name ?? "";
      case "csr":
        return userById(data, client?.csr)?.name ?? "Unassigned";
      case "state":
        return client?.state ?? "";
      case "stage":
        return p.stageIdx;
      case "status":
        return p.status;
      case "priority":
        return PRIORITIES.indexOf(p.priority);
      case "deadline":
        return p.deadline || "9999";
      default:
        return lastAt(p);
    }
  };

  const rows = scoped
    .filter((p) => {
      const c = userById(data, p.client);
      if (!c) return false;
      if (query && !`${p.id} ${c.caseId} ${c.name} ${c.biz ?? ""} ${serviceName(data, p.service)}`.toLowerCase().includes(query)) return false;
      if (filters.stage && STAGES[p.stageIdx] !== filters.stage) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.csr && (filters.csr === "none" ? Boolean(c.csr) : c.csr !== filters.csr)) return false;
      if (filters.state && c.state !== filters.state) return false;
      if (filters.priority && p.priority !== filters.priority) return false;
      if (filters.date === "overdue" && !(p.deadline && p.deadline < todayIso && !isDone(p))) return false;
      if (filters.date === "week" && !(p.deadline && daysFromToday(p.deadline) >= 0 && daysFromToday(p.deadline) <= 7)) return false;
      if (filters.date === "30" && !(p.createdAt > Date.now() - 30 * DAY)) return false;
      if (filters.date === "90" && !(p.createdAt > Date.now() - 90 * DAY)) return false;
      return true;
    })
    .sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pg = Math.min(page, pageCount - 1);
  const visible = rows.slice(pg * PAGE_SIZE, pg * PAGE_SIZE + PAGE_SIZE);
  const activeFilters = FILTER_KEYS.filter((k) => filters[k]).length + (query ? 1 : 0);

  const setFilter = (key: FilterKey, value: string) => {
    nav.setParams({ [key]: value || undefined });
    setPage(0);
  };
  const clearAll = () => {
    nav.setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])));
    setQ("");
    setPage(0);
  };
  const pickSort = (key: SortKey) => {
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
    setPage(0);
  };
  const open = (id: string) => {
    if (dispatch(openCaseCheck(id))) nav.go(caseViewFor(me.role), { id });
  };

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
                setPage(0);
              }}
            />
            {filterSelect("stage", "Filter by stage", "All stages", plain(STAGES))}
            {filterSelect("status", "Filter by status", "All statuses", plain(CASE_STATUSES))}
            <Select aria-label="Filter by CSR" className="w-auto min-w-0 flex-[0_1_auto]" value={filters.csr} onChange={(e) => setFilter("csr", e.target.value)}>
              <option value="">All CSRs</option>
              <option value="none">No CSR</option>
              {csrs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {filterSelect("state", "Filter by formation state", "All states", plain(states))}
            {filterSelect("priority", "Filter by priority", "All priorities", plain(PRIORITIES))}
            <Select
              aria-label="Sort cases"
              className="w-auto min-w-0 flex-[0_1_auto]"
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":");
                setSort({ key: key as SortKey, dir: dir === "1" ? 1 : -1 });
                setPage(0);
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
        <div className="tbl-wrap">
          <table className="data stack min-w-[1160px]">
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => {
                  const on = sort.key === key;
                  return (
                    <th key={key} scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                      <button type="button" className="sortb" onClick={() => pickSort(key)}>
                        {label}
                        {on ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const c = userById(data, p.client);
                const overdue = Boolean(p.deadline) && p.deadline < todayIso && !isDone(p);
                return (
                  <tr key={p.id}>
                    <td className="tl-left">
                      <button type="button" className="linkb mono" aria-label={`Open case ${p.id} for ${c?.name ?? ""}`} onClick={() => open(p.id)}>
                        {c?.caseId}
                      </button>
                      <div className="help mono">
                        {p.id} · {serviceName(data, p.service)}
                      </div>
                    </td>
                    <td data-label="Client">
                      <div className="font-medium">{c?.name}</div>
                      <div className="help">{c?.biz || "—"}</div>
                    </td>
                    <td data-label="CSR" className="whitespace-nowrap">
                      {userById(data, c?.csr)?.name ?? "Unassigned"}
                    </td>
                    <td data-label="State">{c?.state || "—"}</td>
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
                      {ago(lastAt(p))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No cases match these filters" text="Clear a filter or search for a client name or case ID.">
            <Button size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          </EmptyState>
        ) : null}
        <Pager
          page={pg}
          pageCount={pageCount}
          total={rows.length}
          pageSize={PAGE_SIZE}
          noun="cases"
          onPrev={() => setPage(Math.max(0, pg - 1))}
          onNext={() => setPage(Math.min(pageCount - 1, pg + 1))}
        />
      </Card>
      {creating ? <NewCaseDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
