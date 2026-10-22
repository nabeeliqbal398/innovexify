"use client";

import { workloadOf } from "@/components/features/staff/workload";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useData } from "@/hooks/useStore";
import { plural } from "@/lib/dates";

export function StaffWorkload({ onOpen }: { onOpen: (id: string) => void }) {
  const data = useData();
  const rows = data.users
    .filter((u) => u.status === "Active" && (u.role === "CSR" || u.role === "COMPLIANCE"))
    .map((u) => {
      const w = workloadOf(data, u);
      const isCsr = u.role === "CSR";
      return {
        user: u,
        n: isCsr ? w.clients + w.followups + w.tickets : w.cases + w.tasks,
        parts: isCsr
          ? [plural(w.clients, "client"), plural(w.followups, "open follow-up"), plural(w.tickets, "open ticket")].join(" · ")
          : [plural(w.cases, "owned case"), plural(w.tasks, "open task"), `${plural(w.reviews, "review")} in 30 days`].join(" · "),
      };
    });
  const max = Math.max(1, ...rows.map((r) => r.n));

  return (
    <section id="sec-work" className="card scroll-mt-4 overflow-hidden">
      <div className="card-h">
        <span className="h3 flex-1">Workload distribution</span>
        <span className="help">Clients, follow-ups and tickets for CSRs; owned cases and tasks for Compliance</span>
      </div>
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
                <span className="font-medium">{user.name}</span> <Badge tone={ROLE_TONE[user.role]} compact>{ROLE_LABEL[user.role]}</Badge>
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
    </section>
  );
}
