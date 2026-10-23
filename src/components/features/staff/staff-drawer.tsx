"use client";

import { ErrorState, Skeleton } from "@/components/common/query-state";
import { AccountActions } from "@/components/features/staff/account-actions";
import { lastActivity } from "@/components/features/staff/staff-directory";
import { statusTone } from "@/components/features/staff/workload";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/dialog";
import { Chip, Facts } from "@/components/ui/primitives";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useMe } from "@/hooks/useStore";
import { ago } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useAuditQuery } from "@/store/api/system";
import { useClientsQuery, useUserQuery } from "@/store/api/people";
import type { User } from "@/types/domain";

interface StaffDrawerProps {
  userId: string;
  onClose: () => void;
  onEmail: (user: User) => void;
  onRemove: (user: User) => void;
  onOpenClient: (id: string) => void;
}

export function StaffDrawer({ userId, onClose, onEmail, onRemove, onOpenClient }: StaffDrawerProps) {
  const me = useMe();
  const userQuery = useUserQuery(userId);
  const user = userQuery.data;
  const isCsr = user?.role === "CSR";
  const clients = useClientsQuery({ csrId: userId, limit: 100 }, { skip: !isCsr });
  // The audit log is Admin's; a Manager sees the drawer without the activity list.
  const canAudit = can(me, "auditLog");
  const history = useAuditQuery({ actorId: userId, ok: true, limit: 8 }, { skip: !canAudit });

  const w = user?.workload;
  const list: Array<[string, number]> = w
    ? [
        ["Assigned clients", w.clients],
        ["Active cases", w.cases],
        ["Open tasks", w.openTasks],
        ["Overdue tasks", w.overdueTasks],
        ["Open follow-ups", w.openFollowUps],
        ["Open tickets handled", w.openTickets],
        ...(user?.role === "CSR" ? [] : ([["Document reviews (30 days)", w.reviewsLast30Days]] as Array<[string, number]>)),
      ]
    : [];

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={user?.name ?? "Staff details"} subtitle={user ? `${ROLE_LABEL[user.role]} · ${user.email}` : ""}>
      {userQuery.isLoading ? <Skeleton rows={4} /> : null}
      {userQuery.isError ? <ErrorState error={userQuery.error} onRetry={() => void userQuery.refetch()} /> : null}
      {user ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
            <Badge tone={statusTone(user.status)}>{user.status}</Badge>
          </div>
          <Facts
            items={[
              { label: "Last activity", value: lastActivity(user) },
              { label: "Invited by", value: user.invitedByName ?? "Created with the system" },
            ]}
          />
          <section className="card overflow-hidden">
            <div className="card-h">
              <span className="h3">Workload</span>
            </div>
            {list.map(([label, value]) => (
              <div key={label} className="row">
                <span className="flex-1 text-sm">{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          {clients.data?.items.length ? (
            <div className="stack-8">
              <span className="flabel">Assigned clients</span>
              <div className="flex flex-wrap gap-1.5">
                {clients.data.items.map((c) => (
                  <Chip key={c.id} onClick={() => onOpenClient(c.id)}>
                    {c.name}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          <div className="stack-8">
            <span className="flabel">Account actions</span>
            <div className="flex flex-wrap gap-1.5">
              <AccountActions user={user} onEmail={onEmail} onRemove={onRemove} removeLabel="Remove from portal" />
            </div>
          </div>
          {canAudit ? (
            <div className="stack-8">
              <span className="flabel">Recent activity</span>
              {history.isLoading ? <Skeleton rows={2} /> : null}
              {history.data?.items.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <Badge tone="ok" compact>
                    Allowed
                  </Badge>
                  <span className="flex-1">{a.action}</span>
                  <span className="help">{ago(a.at)}</span>
                </div>
              ))}
              {history.data && history.data.items.length === 0 ? <span className="help">No recorded activity yet.</span> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Drawer>
  );
}
