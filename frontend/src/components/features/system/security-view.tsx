"use client";

import { useMemo, useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Callout, Chip, PageHeader, Tabs } from "@/components/ui/primitives";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useStore";
import { saveBlob } from "@/lib/download";
import { can } from "@/lib/permissions";
import { flash } from "@/lib/toast";
import { useAuditExportMutation, useAuditQuery } from "@/store/api/system";
import type { ViewProps } from "@/components/features/workspace/types";

import { AUDIT_CATS, categoryLabel } from "./audit-category";
import { SecurityOverview } from "./security-overview";

type SecTab = "audit" | "overview";

const TABS: ReadonlyArray<{ value: SecTab; label: string }> = [
  { value: "audit", label: "Audit log" },
  { value: "overview", label: "Security overview" },
];

const PAGE_SIZE = 25;

/** A calendar date as YYYY-MM-DD, `days` before today. */
function dayAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SecurityView({ nav }: ViewProps) {
  const me = useMe();
  const run = useAction();
  const [q, setQ] = useState("");
  const [days, setDays] = useState("all");
  const [cat, setCat] = useState("all");
  const [page, setPage] = useState(1);
  const [exportCsv, exporting] = useAuditExportMutation();
  const tab: SecTab = nav.param("tab") === "overview" ? "overview" : "audit";
  const allowed = can(me, "auditLog");
  const search = useDebounced(q.trim(), 300);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      category: cat === "all" ? undefined : cat,
      from: days === "all" ? undefined : dayAgo(Number(days) - 1),
    }),
    [search, cat, days],
  );
  const query = useAuditQuery({ ...filters, page, limit: PAGE_SIZE }, { skip: !allowed || tab !== "audit" });
  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const download = async () => {
    const outcome = await run(exportCsv(filters));
    if (!outcome.ok) return;
    saveBlob(outcome.data.blob, outcome.data.filename);
    flash(outcome.data.truncated ? "Exported the newest 50,000 entries. Narrow the filters to export older ones." : "Audit log exported.");
  };

  if (!allowed) {
    return (
      <div className="stack-16">
        <PageHeader title="Audit & security" />
        <Callout tone="lock" icon="lock">
          The audit log is limited to Admin.
        </Callout>
      </div>
    );
  }

  return (
    <div className="stack-16">
      <PageHeader
        title="Audit & security"
        description="Every allowed and refused action, recorded by the server as it happens. Entries cannot be changed or deleted from the portal."
        actions={
          tab === "audit" ? (
            <Button disabled={exporting.isLoading} onClick={() => void download()}>
              {exporting.isLoading ? "Preparing…" : "Export CSV"}
            </Button>
          ) : null
        }
      />
      <Tabs label="Audit and security" options={TABS} value={tab} onChange={(v) => nav.setParams({ tab: v })} />
      {tab === "audit" ? (
        <section className="card overflow-hidden">
          <div className="card-h">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input
                type="search"
                className="max-w-[280px] flex-1"
                aria-label="Search audit log"
                placeholder="Search actor, action or target"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
              <Select
                aria-label="Date range"
                className="!w-auto"
                value={days}
                onChange={(e) => {
                  setDays(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All dates</option>
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </Select>
              {meta ? <span className="help">{meta.total} entries</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 px-3.5 py-2.5" role="group" aria-label="Category">
            {AUDIT_CATS.map(([key, label]) => (
              <Chip
                key={key}
                active={cat === key}
                onClick={() => {
                  setCat(key);
                  setPage(1);
                }}
              >
                {label}
              </Chip>
            ))}
          </div>
          <QueryState query={query} isEmpty={rows.length === 0} empty={{ title: "No entries match", text: "Widen the date range or clear the search." }} rows={6}>
            <div className="tbl-wrap">
              <table className="data stack min-w-[980px]">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Role</th>
                    <th scope="col">Action</th>
                    <th scope="col">Target</th>
                    <th scope="col">Category</th>
                    <th scope="col">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td data-label="When" className="help whitespace-nowrap">
                        {a.time}
                      </td>
                      <td data-label="Actor" className="whitespace-nowrap">
                        {a.actorName ?? "System"}
                      </td>
                      <td data-label="Role">
                        {a.role ? (
                          <Badge tone={ROLE_TONE[a.role]} compact>
                            {ROLE_LABEL[a.role]}
                          </Badge>
                        ) : (
                          <Badge tone="q" compact />
                        )}
                      </td>
                      <td data-label="Action" className="text-[13px]">
                        {a.action}
                      </td>
                      <td data-label="Target" className="help">
                        {a.target || "—"}
                      </td>
                      <td data-label="Category" className="mini">
                        {categoryLabel(a.cat)}
                      </td>
                      <td data-label="Outcome">
                        <Badge tone={a.ok ? "ok" : "err"}>{a.ok ? "Allowed" : "Refused"}</Badge>
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
                noun="entries"
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            ) : null}
          </QueryState>
        </section>
      ) : (
        <SecurityOverview />
      )}
    </div>
  );
}
