"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { Chip, Count, PageHeader } from "@/components/ui/primitives";
import { PRIORITY_TONE } from "@/constants/vocab";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useStore";
import { REPORT_STATUS } from "@/lib/api-mappers";
import { can } from "@/lib/permissions";
import { useReportCountQuery, useReportsQuery } from "@/store/api/reports";
import type { ReportStatus } from "@/types/domain";

import { ReportDetail } from "./report-detail";
import { ReportForm } from "./report-form";
import { reportLabel, REPORT_TONE } from "./report-status";

type Filter = "all" | ReportStatus;
const PAGE_SIZE = 10;
const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "Submitted", label: "Submitted" },
  { key: "Acknowledged", label: "Acknowledged" },
  { key: "Clarification requested", label: "Clarification requested" },
  { key: "Reviewed", label: "Resolved" },
];

function FilterChip({ filter, active, onClick }: { filter: (typeof FILTERS)[number]; active: boolean; onClick: () => void }) {
  const { data } = useReportCountQuery(filter.key === "all" ? "" : REPORT_STATUS.toKey(filter.key));
  return (
    <Chip active={active} onClick={onClick}>
      {filter.label} <Count>{data ?? "…"}</Count>
    </Chip>
  );
}

/** CSR to Compliance report channel. CSRs see their own reports; Compliance, Admin and Manager see all. Deep link: `?report=<report id>`. */
export function ReportsView() {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const search_ = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const search = useDebounced(query.trim(), 300);

  const result = useReportsQuery({ status: filter === "all" ? undefined : REPORT_STATUS.toKey(filter), search, page, limit: PAGE_SIZE });
  const list = result.data?.items ?? [];
  const meta = result.data?.meta;
  const linked = search_.get("report") ?? "";
  const curId = picked ?? (linked || null);

  const select = (id: string) => {
    setPicked(id);
    const next = new URLSearchParams(search_.toString());
    next.set("report", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="stack-16">
      <PageHeader
        title={me.role === "CSR" ? "Compliance reports" : "CSR reports"}
        description="Private CSR ↔ Compliance channel. Clients and other CSRs never see these reports, and reports never carry client files."
      />
      {can(me, "reportSend") ? <ReportForm onSubmitted={select} /> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Report status">
          {FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              filter={f}
              active={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
            />
          ))}
        </div>
        <Input
          type="search"
          aria-label="Search reports"
          placeholder="Search title, client or RPT number"
          className="ml-auto max-w-[260px]"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <section className="card split overflow-hidden">
        <div className="list">
          <QueryState query={result} isEmpty={list.length === 0} empty={{ title: "No reports here", text: "Reports you are allowed to see appear in this list." }} rows={4}>
            {list.map((r) => {
              const on = r.id === curId;
              return (
                <button key={r.id} type="button" className={`litem${on ? " is-on" : ""}`} aria-current={on ? "true" : undefined} onClick={() => select(r.id)}>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="font-semibold">{r.title}</span>
                    <span className="help">
                      {r.display} · {r.clientName} · by {r.csrName}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={REPORT_TONE[r.status]}>{reportLabel(r.status)}</Badge>
                      <Badge tone={PRIORITY_TONE[r.priority] ?? "q"}>{r.priority || "Normal"}</Badge>
                      <Badge tone="q">{r.category || "Other"}</Badge>
                    </span>
                  </span>
                </button>
              );
            })}
            {meta ? (
              <Pager
                page={meta.page - 1}
                pageCount={meta.totalPages}
                total={meta.total}
                pageSize={PAGE_SIZE}
                noun="reports"
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            ) : null}
          </QueryState>
        </div>
        <div className="flex min-w-0 flex-col">
          {curId ? <ReportDetail key={curId} reportId={curId} /> : <div className="help m-auto p-[30px]">Select a report to read the thread.</div>}
        </div>
      </section>
    </div>
  );
}
