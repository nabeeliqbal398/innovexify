"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { PageHeader, Tabs } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/constants/vocab";
import { useData, useMe } from "@/hooks/useStore";
import type { ViewProps } from "@/components/features/workspace/types";

import { FAQ, GUIDES, type GuideKey } from "./help-content";

type HelpTab = GuideKey | "faq";

const TABS: ReadonlyArray<{ value: HelpTab; label: string }> = [
  { value: "start", label: "Getting started" },
  { value: "roles", label: "Role guides" },
  { value: "docs", label: "Documents" },
  { value: "tickets", label: "Tickets" },
  { value: "faq", label: "FAQ" },
];

function isHelpTab(v: string | undefined): v is HelpTab {
  return TABS.some((t) => t.value === v);
}

export function HelpView({ nav }: ViewProps) {
  const me = useMe();
  const { company } = useData();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const param = nav.param("tab");
  const tab: HelpTab = isHelpTab(param) ? param : "start";
  const myRole = ROLE_LABEL[me.role];

  return (
    <div className="stack-16">
      <PageHeader title="Help & guidance" description={`How to use the ${company.name} CRM as ${myRole}.`} />
      <Tabs label="Help topics" options={TABS} value={tab} onChange={(v) => nav.setParams({ tab: v })} />
      {tab === "faq" ? (
        <section className="card overflow-hidden">
          <div className="card-h">
            <span className="h3">Frequently asked questions</span>
          </div>
          {FAQ.map(([q, a], i) => (
            <div key={q} className="border-b border-border last:border-b-0">
              <button
                type="button"
                aria-expanded={!!open[i]}
                onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-left font-medium hover:bg-muted"
              >
                <span>{q}</span>
                <Icon name={open[i] ? "chevD" : "chevR"} small />
              </button>
              {open[i] ? <div className="px-3.5 pb-3 text-sm text-neutral">{a}</div> : null}
            </div>
          ))}
        </section>
      ) : (
        <section className="card overflow-hidden">
          <div className="card-h">
            <span className="h3">{GUIDES[tab].title}</span>
          </div>
          {GUIDES[tab].items.map(([q, a]) => (
            <div key={q} className="row items-start">
              <div className="min-w-[150px] flex-[0_1_200px] font-semibold">
                {q}
                {tab === "roles" && q === myRole ? (
                  <>
                    {" "}
                    <Badge tone="brand">Your role</Badge>
                  </>
                ) : null}
              </div>
              <div className="mini flex-[1_1_300px]">{a}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
