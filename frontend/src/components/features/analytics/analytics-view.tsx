"use client";

import { useMemo, useState } from "react";

import { ErrorState } from "@/components/common/query-state";
import { Callout, Card, CardHeader, HBar, PageHeader, Segmented, Skeleton, VBars } from "@/components/ui/primitives";
import { can } from "@/lib/permissions";
import { useMe } from "@/hooks/useStore";
import { useAnalyticsQuery } from "@/store/api/dashboard";
import { RANGES, type Analytics, type RangeKey } from "./analytics-model";

/** A calendar date as YYYY-MM-DD in the person's own day, `days` before today (the server reads it as a UTC date). */
function dayAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi">
      <span className="help">{label}</span>
      <span className="text-2xl font-semibold leading-[30px]">{value}</span>
      <span className="help">{sub}</span>
    </div>
  );
}

function BarCard({ title, aside, rows, fixedMax, suffix }: { title: string; aside?: string; rows: Array<{ label: string; n: number }>; fixedMax?: number; suffix?: string }) {
  const max = fixedMax ?? Math.max(1, ...rows.map((r) => r.n));
  return (
    <Card>
      <CardHeader title={title}>{aside ? <span className="help">{aside}</span> : null}</CardHeader>
      <div className="card-b gap-0.5">
        {rows.map((r) => (
          <HBar key={r.label} label={r.label} value={r.n} max={max} display={suffix ? `${r.n}${suffix}` : undefined} />
        ))}
      </div>
    </Card>
  );
}

function TasksCard({ a }: { a: Analytics }) {
  const total = Math.max(1, a.tDone + a.tOver);
  return (
    <Card>
      <CardHeader title="Tasks completed vs overdue" />
      <div className="card-b">
        <div className="flex gap-[18px]">
          <div>
            <div className="text-2xl font-semibold text-success">{a.tDone}</div>
            <div className="help">Completed in range</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-danger-hover">{a.tOver}</div>
            <div className="help">Overdue now</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{a.tOpen}</div>
            <div className="help">Open now</div>
          </div>
        </div>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-neutral-soft"
          role="img"
          aria-label={`${a.tDone} completed, ${a.tOver} overdue`}
        >
          <span className="bg-success" style={{ width: `${Math.round((a.tDone / total) * 100)}%` }} />
          <span className="bg-danger" style={{ width: `${Math.round((a.tOver / total) * 100)}%` }} />
        </div>
      </div>
    </Card>
  );
}

function WorkloadTables({ a }: { a: Analytics }) {
  return (
    <>
      <Card>
        <CardHeader title="CSR workload and follow-up activity" />
        <div className="tbl-wrap">
          <table className="data stack min-w-[640px]">
            <thead>
              <tr>
                <th scope="col">CSR</th>
                <th scope="col">Assigned clients</th>
                <th scope="col">Open follow-ups</th>
                <th scope="col">Follow-ups completed</th>
                <th scope="col">Interactions recorded</th>
                <th scope="col">Open tickets</th>
              </tr>
            </thead>
            <tbody>
              {a.csr.map((r) => (
                <tr key={r.id}>
                  <td className="tl-left font-medium">{r.name}</td>
                  <td data-label="Assigned clients">{r.clients}</td>
                  <td data-label="Open follow-ups">{r.open}</td>
                  <td data-label="Completed">{r.done}</td>
                  <td data-label="Interactions">{r.inter}</td>
                  <td data-label="Open tickets">{r.tickets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Compliance workload" />
        <div className="tbl-wrap">
          <table className="data stack min-w-[560px]">
            <thead>
              <tr>
                <th scope="col">Reviewer</th>
                <th scope="col">Document reviews</th>
                <th scope="col">Owned active cases</th>
                <th scope="col">Open tasks</th>
                <th scope="col">CSR reports handled</th>
              </tr>
            </thead>
            <tbody>
              {a.comp.map((r) => (
                <tr key={r.id}>
                  <td className="tl-left font-medium">{r.name}</td>
                  <td data-label="Reviews">{r.reviews}</td>
                  <td data-label="Owned cases">{r.cases}</td>
                  <td data-label="Open tasks">{r.tasks}</td>
                  <td data-label="Reports">{r.reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export function AnalyticsView() {
  const me = useMe();
  const [range, setRange] = useState<RangeKey>("90");
  const allowed = can(me, "analytics");
  const days = RANGES.find((r) => r.value === range)?.days ?? 90;
  // A 24-month range is the longest the server allows: it starts 729 days back so today is included.
  const window = useMemo(() => ({ from: dayAgo(days - 1), to: dayAgo(0) }), [days]);
  const query = useAnalyticsQuery(window, { skip: !allowed });
  const a = allowed ? query.data : null;

  if (!allowed) {
    return (
      <div className="stack-16">
        <PageHeader title="Reports & analytics" />
        <Callout tone="lock" icon="lock">
          Reports and analytics are available to Admin and Manager accounts.
        </Callout>
      </div>
    );
  }

  const phrase = RANGES.find((r) => r.value === range)?.phrase ?? "";
  return (
    <div className="stack-16">
      <PageHeader
        title="Reports & analytics"
        description={`Counted from the live records (${phrase}). Results are cached for about a minute.`}
        actions={<Segmented label="Date range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />}
      />
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} title="We could not load the figures" /> : null}
      {!a && !query.isError ? (
        <div className="statgrid" aria-busy="true" aria-label="Loading analytics">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[120px]" />
          ))}
        </div>
      ) : null}
      {a ? (
        <>
          <section className="kpis" aria-label="Headline figures">
            <Figure label="Formations completed" value={String(a.completed)} sub="in range" />
            <Figure label="Average case duration" value={a.avgDuration} sub="opened → completed" />
            <Figure label="Document review turnaround" value={a.revAvg} sub={`${a.revN} reviews · ${a.revRejected} sent back`} />
            <Figure label="Ticket resolution time" value={a.tkAvg} sub={`${a.tkN} resolved · ${a.tkOpen} open · ${a.tkReopened} reopened`} />
          </section>
          <div className="statgrid">
            <BarCard title="Cases by stage" rows={a.stage} />
            <BarCard title="Cases by status" rows={a.status} />
            <Card>
              <CardHeader title="Completed formations by month" />
              <div className="card-b">
                <VBars label="Completed formations by month" data={a.monthly} />
              </div>
            </Card>
            <TasksCard a={a} />
            <BarCard title="Client onboarding completion" aside={`${a.clientsN} clients`} rows={a.onboard.map((r) => ({ label: r.label, n: r.pct }))} fixedMax={100} suffix="%" />
          </div>
          <WorkloadTables a={a} />
        </>
      ) : null}
    </div>
  );
}
