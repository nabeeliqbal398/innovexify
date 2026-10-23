"use client";

import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { plural } from "@/lib/dates";
import { useUsersQuery } from "@/store/api/people";

export function StaffWorkload({ onOpen }: { onOpen: (id: string) => void }) {
  const csrs = useUsersQuery({ role: "CSR", status: "ACTIVE", limit: 100, sort: "name", order: "asc" });
  const comps = useUsersQuery({ role: "COMPLIANCE", status: "ACTIVE", limit: 100, sort: "name", order: "asc" });
  const rows = [...(csrs.data?.items ?? []), ...(comps.data?.items ?? [])].map((u) => {
    const w = u.workload;
    const isCsr = u.role === "CSR";
    return {
      user: u,
      n: !w ? 0 : isCsr ? w.clients + w.openFollowUps + w.openTickets : w.cases + w.openTasks,
      parts: !w
        ? ""
        : isCsr
          ? [plural(w.clients, "client"), plural(w.openFollowUps, "open follow-up"), plural(w.openTickets, "open ticket")].join(" · ")
          : [plural(w.cases, "owned case"), plural(w.openTasks, "open task"), `${plural(w.reviewsLast30Days, "review")} in 30 days`].join(" · "),
    };
  });
  const max = Math.max(1, ...rows.map((r) => r.n));
  const query = {
    isLoading: csrs.isLoading || comps.isLoading,
    isError: csrs.isError || comps.isError,
    error: csrs.error ?? comps.error,
    refetch: () => {
      void csrs.refetch();
      void comps.refetch();
    },
  };

  return (
    <section id="sec-work" className="card scroll-mt-4 overflow-hidden">
      <div className="card-h">
        <span className="h3 flex-1">Workload distribution</span>
        <span className="help">Clients, follow-ups and tickets for CSRs; owned cases and tasks for Compliance</span>
      </div>
      <QueryState query={query} isEmpty={rows.length === 0} empty={{ title: "No CSR or Compliance users yet" }} rows={3}>
        <div className="card-b !gap-1">
          {rows.map(({ user, n, parts }) => {
            const pct = Math.round((n / max) * 100);
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => onOpen(user.id)}
                aria-label={`Open ${user.name}, workload ${n}`}
                className="grid w-full cursor-pointer grid-cols-[minmax(150px,220px)_1fr_34px] items-center gap-2.5 rounded-md py-[3px] text-left text-sm hover:bg-background"
              >
                <span>
                  <span className="font-medium">{user.name}</span>{" "}
                  <Badge tone={ROLE_TONE[user.role]} compact>
                    {ROLE_LABEL[user.role]}
                  </Badge>
                  <span className="help block">{parts}</span>
                </span>
                <span className="block h-2.5 overflow-hidden rounded-full bg-primary-soft">
                  <span className="block h-full rounded-full bg-primary transition-[width] duration-[400ms]" style={{ width: `${Math.max(n ? 4 : 0, pct)}%` }} />
                </span>
                <span className="text-right tabular-nums text-neutral">{n}</span>
              </button>
            );
          })}
        </div>
      </QueryState>
    </section>
  );
}
