"use client";

import { useMemo } from "react";

import type { ViewProps } from "@/components/features/workspace/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useData, useMe } from "@/hooks/useStore";
import {
  AttentionList,
  CompletionTrends,
  goTo,
  RecentActivity,
  ReviewActivity,
  StageDistribution,
  TeamWorkload,
  UpcomingDeadlines,
} from "./overview-cards";
import { buildOverview } from "./overview-model";

const TONE_CLASS = { warn: "text-warning", err: "text-danger-hover" } as const;

export function OverviewView({ nav }: ViewProps) {
  const data = useData();
  const me = useMe();
  const ov = useMemo(() => buildOverview(data, me), [data, me]);

  return (
    <div className="stack-16">
      <PageHeader title={ov.title} description={ov.sub} />
      <section className="kpis" aria-label="Key figures">
        {ov.kpis.map((k) => (
          <button key={k.label} type="button" className="kpi" onClick={() => goTo(nav, k.target)}>
            <span className="help">{k.label}</span>
            <span className="text-2xl font-semibold leading-[30px]">{k.value}</span>
            <span className={cn("help", k.tone && TONE_CLASS[k.tone])}>{k.sub}</span>
          </button>
        ))}
      </section>
      <div className="flex flex-wrap gap-2">
        {ov.shortcuts.map((s) => (
          <Button key={s.label} variant={s.primary ? "primary" : "default"} onClick={() => goTo(nav, s.target)}>
            <Icon name={s.icon} small />
            {s.label}
          </Button>
        ))}
      </div>
      {ov.biz ? (
        <div className="statgrid">
          <StageDistribution bars={ov.stageDist} nav={nav} />
          <CompletionTrends ov={ov} />
          <UpcomingDeadlines items={ov.deadlines} nav={nav} />
          <TeamWorkload csr={ov.workCsr} comp={ov.workComp} nav={nav} />
        </div>
      ) : null}
      <div className="grid2">
        <AttentionList title={ov.listTitle} items={ov.list} nav={nav} />
        <RecentActivity items={ov.activity} />
      </div>
      {ov.comp ? <ReviewActivity items={ov.reviews} nav={nav} /> : null}
    </div>
  );
}
