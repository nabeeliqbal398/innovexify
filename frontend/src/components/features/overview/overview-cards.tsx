"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, Card, CardHeader, EmptyState, HBar, Segmented, VBars } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import type { ActivityItem, Deadline, ListItem, Overview, ReviewItem, StageBar, Target, WorkloadRow } from "./overview-model";

export const goTo = (nav: WorkspaceNav, t: Target) => nav.go(t.view, { id: t.id, query: t.query });

type TrendMode = "monthly" | "weekly";

export function StageDistribution({ bars, nav }: { bars: StageBar[]; nav: WorkspaceNav }) {
  const max = Math.max(1, ...bars.map((b) => b.n));
  return (
    <Card>
      <CardHeader title="Case-stage distribution">
        <span className="help">Select a stage to filter cases</span>
      </CardHeader>
      <div className="card-b gap-0.5">
        {bars.map((b) => (
          <HBar key={b.label} label={b.label} value={b.n} max={max} ariaLabel={`${b.label}: ${b.n} cases`} onClick={() => goTo(nav, b.target)} />
        ))}
      </div>
    </Card>
  );
}

export function CompletionTrends({ ov }: { ov: Overview }) {
  const [mode, setMode] = useState<TrendMode>("monthly");
  const monthly = mode === "monthly";
  return (
    <Card>
      <CardHeader title="Completion trends">
        <Segmented
          label="Trend period"
          value={mode}
          onChange={setMode}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "weekly", label: "Weekly" },
          ]}
        />
      </CardHeader>
      <div className="card-b">
        <div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2 rounded-sm bg-[#6366F1]" />
            Formations completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2 rounded-sm bg-[#0EA5E9]" />
            Tasks completed
          </span>
        </div>
        <VBars label="Formations completed per period" data={monthly ? ov.trendMonthly : ov.trendWeekly} />
        <VBars alt height={90} label="Tasks completed per period" data={monthly ? ov.tasksMonthly : ov.tasksWeekly} />
      </div>
    </Card>
  );
}

export function UpcomingDeadlines({ items, nav }: { items: Deadline[]; nav: WorkspaceNav }) {
  return (
    <Card>
      <CardHeader title="Upcoming deadlines">
        <span className="help">Next 14 days and overdue</span>
      </CardHeader>
      {items.map((d) => (
        <button key={d.key} type="button" onClick={() => goTo(nav, d.target)} className="row w-full cursor-pointer text-left hover:bg-background">
          <Badge tone={d.tone}>{d.rel}</Badge>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">{d.title}</span>
            <span className="help">
              {d.kind} · {d.day}
            </span>
          </span>
        </button>
      ))}
      {items.length === 0 ? <EmptyState title="No deadlines in the next two weeks" text="Case target dates and task due dates appear here." /> : null}
    </Card>
  );
}

function WorkloadGroup({ label, rows, nav }: { label: string; rows: WorkloadRow[]; nav: WorkspaceNav }) {
  return (
    <>
      <span className="flabel">{label}</span>
      {rows.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => goTo(nav, w.target)}
          aria-label={`${w.name}: ${w.a}, ${w.b}, ${w.c}`}
          className="flex w-full cursor-pointer flex-col gap-1 rounded-md py-1 text-left hover:bg-background"
        >
          <span className="flex w-full flex-wrap justify-between gap-x-2">
            <span className="text-sm font-medium">{w.name}</span>
            <span className="help">
              {w.a} · {w.b} · {w.c}
            </span>
          </span>
          <span className="block h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${w.load}%` }} />
          </span>
        </button>
      ))}
    </>
  );
}

export function TeamWorkload({ csr, comp, nav }: { csr: WorkloadRow[]; comp: WorkloadRow[]; nav: WorkspaceNav }) {
  return (
    <Card>
      <CardHeader title="Team workload">
        <span className="help">Open items per person</span>
      </CardHeader>
      <div className="card-b">
        <WorkloadGroup label="CSR" rows={csr} nav={nav} />
        <WorkloadGroup label="Compliance" rows={comp} nav={nav} />
      </div>
    </Card>
  );
}

export function AttentionList({ title, items, nav }: { title: string; items: ListItem[]; nav: WorkspaceNav }) {
  return (
    <Card>
      <CardHeader title={title} />
      {items.map((r) => (
        <div key={r.key} className="row">
          <div className="min-w-0 flex-[1_1_220px]">
            <div className="font-medium">{r.title}</div>
            <div className="help">{r.meta}</div>
          </div>
          <Badge tone={r.tone}>{r.tag}</Badge>
          <Button size="sm" onClick={() => goTo(nav, r.target)}>
            {r.cta}
          </Button>
        </div>
      ))}
      {items.length === 0 ? <EmptyState title="Nothing needs attention" text="New items appear here as soon as they arrive." /> : null}
    </Card>
  );
}

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader title="Recent activity" />
      {items.map((a) => (
        <div key={a.key} className="row items-start">
          <Avatar initials={a.initials} className={cn(a.isClient && "bg-neutral-soft text-neutral")} />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{a.actor}</span>{" "}
            <Badge tone={a.roleTone} compact>
              {a.role}
            </Badge>{" "}
            {a.action}
            <div className="help">
              {a.target} · {a.time}
            </div>
          </div>
        </div>
      ))}
      {items.length === 0 ? <EmptyState title="No activity yet" /> : null}
    </Card>
  );
}

export function ReviewActivity({ items, nav }: { items: ReviewItem[]; nav: WorkspaceNav }) {
  return (
    <Card>
      <CardHeader title="Recent review activity">
        <Button size="sm" onClick={() => nav.go("documents")}>
          Open review queue
        </Button>
      </CardHeader>
      {items.map((r) => (
        <div key={r.key} className="row">
          <div className="min-w-0 flex-[1_1_220px]">
            <div className="font-medium">{r.title}</div>
            <div className="help">{r.meta}</div>
          </div>
          <Badge tone={r.tone}>{r.tag}</Badge>
        </div>
      ))}
      {items.length === 0 ? <EmptyState title="No reviews yet" /> : null}
    </Card>
  );
}
