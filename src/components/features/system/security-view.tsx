"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
import { Chip, Count, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useData } from "@/hooks/useStore";
import { fmtAt } from "@/lib/dates";
import type { ViewProps } from "@/components/features/workspace/types";

import { AUDIT_CATS, catOfEntry, categoryLabel } from "./audit-category";
import { SecurityOverview } from "./security-overview";

type SecTab = "audit" | "overview";

const TABS: ReadonlyArray<{ value: SecTab; label: string }> = [
  { value: "audit", label: "Audit log" },
  { value: "overview", label: "Security overview" },
];

const DAY = 86_400_000;
const LIMIT = 60;

export function SecurityView({ nav }: ViewProps) {
  const data = useData();
  const [q, setQ] = useState("");
  const [days, setDays] = useState("all");
  const [cat, setCat] = useState("all");
  const tab: SecTab = nav.param("tab") === "overview" ? "overview" : "audit";

  const withCat = useMemo(() => data.audit.map((a) => ({ a, cat: catOfEntry(a) })), [data.audit]);
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "?";
  const refused = data.audit.filter((a) => !a.ok).length;

  const needle = q.trim().toLowerCase();
  const since = days === "all" ? 0 : Date.now() - Number(days) * DAY;
  const rows = withCat.filter(({ a, cat: c }) => {
    if (since && (a.at || 0) < since) return false;
    if (cat === "refused" && a.ok) return false;
    if (cat !== "all" && cat !== "refused" && c !== cat) return false;
    if (!needle) return true;
    return `${userName(a.actor)} ${a.action} ${a.target} ${a.role ?? ""}`.toLowerCase().includes(needle);
  });

  const countFor = (key: string) =>
    key === "all" ? data.audit.length : key === "refused" ? refused : withCat.filter((x) => x.cat === key).length;

  return (
    <div className="stack-16">
      <PageHeader
        title="Audit & security"
        description="Every allowed and refused action in this demo session. This log is held in the browser for the prototype; it is not immutable."
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
                onChange={(e) => setQ(e.target.value)}
              />
              <Select aria-label="Date range" className="!w-auto" value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="all">All dates</option>
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </Select>
              <span className="help">
                {rows.length} entries · {refused} refused
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 px-3.5 py-2.5" role="group" aria-label="Category">
            {AUDIT_CATS.map(([key, label]) => (
              <Chip key={key} active={cat === key} onClick={() => setCat(key)}>
                {label} <Count>{countFor(key)}</Count>
              </Chip>
            ))}
          </div>
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
                {rows.slice(0, LIMIT).map(({ a, cat: c }, i) => {
                  const role = a.role ?? data.users.find((u) => u.id === a.actor)?.role;
                  return (
                    <tr key={`${a.at}-${i}`}>
                      <td data-label="When" className="help whitespace-nowrap">
                        {a.at ? fmtAt(a.at) : a.time}
                      </td>
                      <td data-label="Actor" className="whitespace-nowrap">
                        {userName(a.actor)}
                      </td>
                      <td data-label="Role">
                        {role ? (
                          <Badge tone={ROLE_TONE[role]} compact>
                            {ROLE_LABEL[role]}
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
                        {categoryLabel(c)}
                      </td>
                      <td data-label="Outcome">
                        <Badge tone={a.ok ? "ok" : "err"}>{a.ok ? "Allowed" : "Refused"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="No entries match" text="Widen the date range or clear the search." />
          ) : null}
          {rows.length > LIMIT ? (
            <p className="help px-3.5 py-2.5">
              Showing the latest {LIMIT} matching entries. Narrow the filters to see older ones.
            </p>
          ) : null}
        </section>
      ) : (
        <SecurityOverview sessionStartedAt={data.sessionStartedAt} />
      )}
    </div>
  );
}
