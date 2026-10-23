"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { Chip, PageHeader } from "@/components/ui/primitives";
import { TICKET_STATUSES, TICKET_TONE } from "@/constants/vocab";
import { useDebounced } from "@/hooks/useDebounced";
import { TICKET_STATUS } from "@/lib/api-mappers";
import { useTicketsQuery, type ListTicketsParams } from "@/store/api/tickets";

import { TicketDetail } from "./ticket-detail";

const PAGE_SIZE = 20;

interface FilterDef {
  key: string;
  label: string;
  params: Partial<Pick<ListTicketsParams, "group" | "status">>;
}
const FILTERS: readonly FilterDef[] = [
  { key: "active", label: "Active", params: { group: "active" } },
  { key: "all", label: "All", params: {} },
  ...TICKET_STATUSES.map((s) => ({ key: s, label: s, params: { status: TICKET_STATUS.toKey(s) } })),
];

/** Staff ticket queue: split list and detail, filtered by status. State lives in `?ticket=<id>` and `?filter=`. */
export function TicketsView({ nav }: ViewProps) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim(), 300);
  const active = FILTERS.find((f) => f.key === nav.param("filter")) ?? (FILTERS[0] as FilterDef);
  const list = useTicketsQuery({ ...active.params, search, page, limit: PAGE_SIZE }, { pollingInterval: 60_000, skipPollingIfUnfocused: true });
  const rows = list.data?.items ?? [];
  const meta = list.data?.meta;
  const curId = nav.param("ticket");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tickets"
        description="Client complaints and service issues. Every status change records who made it, their role and when."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Search tickets"
          placeholder="Search title, client or TKT number"
          className="max-w-[300px] flex-[1_1_200px]"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ticket filter">
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              active={f.key === active.key}
              onClick={() => {
                setPage(1);
                nav.setParams({ filter: f.key === "active" ? undefined : f.key });
              }}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>
      <section className="card split overflow-hidden">
        <div className="list">
          <QueryState query={list} isEmpty={rows.length === 0} empty={{ title: "No tickets in this view." }} rows={4}>
            {rows.map((t) => {
              const on = t.id === curId || t.display.toLowerCase() === curId.toLowerCase();
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`litem${on ? " is-on" : ""}`}
                  aria-current={on ? "true" : undefined}
                  onClick={() => nav.setParams({ ticket: t.id })}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="flex items-center gap-1.5">
                      <span className="mono help">{t.display}</span>
                      <Badge tone={t.priority === "High" || t.priority === "Urgent" ? "err" : "q"} compact>
                        {t.priority}
                      </Badge>
                      {t.escalated ? (
                        <Badge tone="err" compact>
                          Escalated
                        </Badge>
                      ) : null}
                    </span>
                    <span className="font-semibold">{t.title}</span>
                    <span className="help">
                      {t.clientName} · <span className="mono">{t.clientCaseId}</span> · {t.category}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge tone={TICKET_TONE[t.status]}>{t.status}</Badge>
                      <span className="help">{t.updated}</span>
                    </span>
                  </span>
                </button>
              );
            })}
            {meta && meta.totalPages > 1 ? (
              <Pager
                page={meta.page - 1}
                pageCount={meta.totalPages}
                total={meta.total}
                pageSize={PAGE_SIZE}
                noun="tickets"
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            ) : null}
          </QueryState>
        </div>
        <div className="flex min-w-0 flex-col">
          {curId ? <TicketDetail key={curId} ticketId={curId} /> : <div className="help m-auto p-[30px]">Select a ticket to see its details and history.</div>}
        </div>
      </section>
    </div>
  );
}
