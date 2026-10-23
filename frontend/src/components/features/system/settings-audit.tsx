"use client";

import { useState } from "react";

import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/primitives";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useAuditQuery } from "@/store/api/system";
import type { ViewProps } from "@/components/features/workspace/types";

type Filter = "all" | "allowed" | "denied";

const FILTERS: ReadonlyArray<readonly [Filter, string]> = [
  ["all", "All"],
  ["allowed", "Allowed"],
  ["denied", "Refused"],
];

/** The latest entries of the audit log, with the outcome filter; the full log is in Audit & Security. */
export function SettingsAudit({ nav }: ViewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const query = useAuditQuery({ limit: 40, ...(filter === "all" ? {} : { ok: filter === "allowed" }) });
  const rows = query.data?.items ?? [];

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
        <span className="h3 flex-1">Audit log</span>
        <Button size="sm" onClick={() => nav.go("security")}>
          Open Audit &amp; Security center
        </Button>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Outcome">
          {FILTERS.map(([key, label]) => (
            <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>
      <QueryState query={query} isEmpty={rows.length === 0} empty={{ title: "No entries yet" }} rows={5}>
        <div className="tbl-wrap">
          <table className="data min-w-[760px]">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="help whitespace-nowrap">{a.time}</td>
                  <td className="whitespace-nowrap">
                    {a.actorName ?? "System"}{" "}
                    {a.role ? (
                      <Badge tone={ROLE_TONE[a.role]} compact>
                        {ROLE_LABEL[a.role]}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="text-[13px]">{a.action}</td>
                  <td className="help">{a.target}</td>
                  <td>
                    <Badge tone={a.ok ? "ok" : "err"}>{a.ok ? "Allowed" : "Refused"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </section>
  );
}
