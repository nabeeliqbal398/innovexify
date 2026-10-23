"use client";

import { useState } from "react";

import { QueryState } from "@/components/common/query-state";
import { ServiceDrawer } from "@/components/features/services/service-drawer";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { Callout, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/dates";
import { useCompanyQuery, useServicesQuery } from "@/store/api/system";

/** Service catalog: what the company offers, what each service needs, and the stages it moves through. */
export function ServicesView() {
  const company = useCompanyQuery();
  const query = useServicesQuery();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const q = search.trim().toLowerCase();
  const all = query.data ?? [];
  const services = all.filter((s) => !q || `${s.name} ${s.category} ${s.desc}`.toLowerCase().includes(q));
  const open = all.find((s) => s.id === openId) ?? null;

  return (
    <div className="stack-16">
      <PageHeader
        title="Service catalog"
        description={`What ${company.data?.name ?? "the company"} offers, the information each service needs, and the stages it moves through.`}
        actions={
          <Input
            type="search"
            aria-label="Search services"
            placeholder="Search services"
            className="max-w-[280px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      />
      <Callout tone="lock" icon="alert">
        Fees and turnaround are internal fields. They are not published prices, legal advice or guaranteed processing times, and are left unset until someone fills them in.
      </Callout>
      <QueryState query={query} isEmpty={services.length === 0} empty={{ title: "No services match" }} rows={4}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-3">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpenId(s.id)}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-xl border bg-surface p-3.5 text-left transition-[border-color,box-shadow] hover:border-[#A5B4FC] hover:shadow-[0_0_0_3px_hsl(var(--primary-soft))]",
                openId === s.id ? "border-[#A5B4FC] shadow-[0_0_0_3px_hsl(var(--primary-soft))]" : "border-border",
              )}
            >
              <span className="flex w-full items-center gap-1.5">
                <span className="flex-1 font-semibold">{s.name}</span>
                <Badge tone={s.active ? "ok" : "q"}>{s.active ? "Offered" : "Not offered"}</Badge>
              </span>
              <span className="help">
                {s.category} · {s.stages.length} stages · {s.reqs.length} requirements
              </span>
              <span className="mini">{s.desc}</span>
              <span className="help flex flex-wrap gap-2.5">
                <span>{s.fee || "Fee not set"}</span>
                <span>{s.turnaround || "Turnaround not set"}</span>
                <span>{plural(s.activeCases ?? 0, "active case")}</span>
              </span>
            </button>
          ))}
        </div>
      </QueryState>
      <ServiceDrawer service={open} onClose={() => setOpenId(null)} />
    </div>
  );
}
