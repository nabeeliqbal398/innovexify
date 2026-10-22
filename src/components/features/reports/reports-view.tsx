"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Chip, Count, EmptyState, PageHeader } from "@/components/ui/primitives";
import { PRIORITY_TONE } from "@/constants/vocab";
import { useData, useMe } from "@/hooks/useStore";
import { can } from "@/lib/permissions";
import { userName } from "@/store/selectors";
import type { ReportStatus } from "@/types/domain";

import { ReportDetail } from "./report-detail";
import { ReportForm } from "./report-form";
import { reportLabel, REPORT_TONE } from "./report-status";

type Filter = "all" | ReportStatus;
const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "Submitted", label: "Submitted" },
  { key: "Acknowledged", label: "Acknowledged" },
  { key: "Clarification requested", label: "Clarification requested" },
  { key: "Reviewed", label: "Resolved" },
];

/** CSR to Compliance report channel. CSRs see their own reports; Compliance, Admin and Manager see all. */
export function ReportsView() {
  const data = useData();
  const me = useMe();
  const [filter, setFilter] = useState<Filter>("all");
  const [curId, setCurId] = useState<string | null>(useSearchParams().get("report"));

  const visible = data.reports.filter((r) => can(me, "reportView", r));
  const list = visible.filter((r) => filter === "all" || r.status === filter);
  const cur = visible.find((r) => r.id === curId);

  return (
    <div className="stack-16">
      <PageHeader
        title={me.role === "CSR" ? "Compliance reports" : "CSR reports"}
        description="Private CSR ↔ Compliance channel. Clients and other CSRs never see these reports, and reports never carry client files."
      />
      {can(me, "reportSend") ? <ReportForm onSubmitted={(id) => setCurId(id)} /> : null}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Report status">
        {FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label} <Count>{f.key === "all" ? visible.length : visible.filter((r) => r.status === f.key).length}</Count>
          </Chip>
        ))}
      </div>
      <section className="card split overflow-hidden">
        <div className="list">
          {list.map((r) => {
            const on = r.id === cur?.id;
            return (
              <button
                key={r.id}
                type="button"
                className={`litem${on ? " is-on" : ""}`}
                aria-current={on ? "true" : undefined}
                onClick={() => setCurId(r.id)}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="font-semibold">{r.title}</span>
                  <span className="help">
                    {r.id} · {userName(data, r.client)} · by {userName(data, r.csr)}
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
          {list.length === 0 ? <EmptyState title="No reports here" text="Reports you're allowed to see appear in this list." /> : null}
        </div>
        <div className="flex min-w-0 flex-col">
          {cur ? (
            <ReportDetail key={cur.id} report={cur} />
          ) : (
            <div className="help m-auto p-[30px]">Select a report to read the thread.</div>
          )}
        </div>
      </section>
    </div>
  );
}
