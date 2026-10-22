"use client";

import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Chip, Count, PageHeader } from "@/components/ui/primitives";
import { TICKET_STATUSES, TICKET_TONE } from "@/constants/vocab";
import { useData, useMe } from "@/hooks/useStore";
import { can } from "@/lib/permissions";
import { userById } from "@/store/selectors";
import type { Ticket } from "@/types/domain";

import { TicketDetail } from "./ticket-detail";

const isActive = (t: Ticket) => t.status !== "Resolved" && t.status !== "Closed";

const FILTERS: ReadonlyArray<{ key: string; label: string; test: (t: Ticket) => boolean }> = [
  { key: "active", label: "Active", test: isActive },
  { key: "all", label: "All", test: () => true },
  ...TICKET_STATUSES.map((s) => ({ key: s, label: s, test: (t: Ticket) => t.status === s })),
];

/** Staff ticket queue: split list and detail, filtered by status. State lives in `?ticket=` and `?filter=`. */
export function TicketsView({ nav }: ViewProps) {
  const data = useData();
  const me = useMe();

  const scoped = data.tickets.filter((t) =>
    can(me, "ticketsStaff", { client: t.client, csrOf: userById(data, t.client)?.csr }),
  );
  const active = FILTERS.find((f) => f.key === nav.param("filter")) ?? FILTERS[0];
  const rows = scoped.filter(active.test);
  const cur = scoped.find((t) => t.id === nav.param("ticket"));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tickets"
        description="Client complaints and service issues. Every status change records who made it, their role and when."
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ticket filter">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            active={f.key === active.key}
            onClick={() => nav.setParams({ filter: f.key === "active" ? undefined : f.key })}
          >
            {f.label} <Count>{scoped.filter(f.test).length}</Count>
          </Chip>
        ))}
      </div>
      <section className="card split overflow-hidden">
        <div className="list">
          {rows.map((t) => {
            const client = userById(data, t.client);
            const on = t.id === cur?.id;
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
                    <span className="mono help">{t.id}</span>
                    <Badge tone={t.priority === "High" ? "err" : "q"} compact>
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
                    {client?.name ?? "—"} · <span className="mono">{client?.caseId}</span> · {t.category}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={TICKET_TONE[t.status]}>{t.status}</Badge>
                    <span className="help">{t.updated}</span>
                  </span>
                </span>
              </button>
            );
          })}
          {rows.length === 0 ? <div className="row help">No tickets in this view.</div> : null}
        </div>
        <div className="flex min-w-0 flex-col">
          {cur ? (
            <TicketDetail key={cur.id} ticket={cur} />
          ) : (
            <div className="help m-auto p-[30px]">Select a ticket to see its details and history.</div>
          )}
        </div>
      </section>
    </div>
  );
}
