"use client";

import { AccountActions } from "@/components/features/staff/account-actions";
import { lastActivity } from "@/components/features/staff/staff-directory";
import { statusTone, workloadOf } from "@/components/features/staff/workload";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/dialog";
import { Chip, Facts } from "@/components/ui/primitives";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useData } from "@/hooks/useStore";
import { ago } from "@/lib/dates";
import { userName } from "@/store/selectors";

interface StaffDrawerProps {
  userId: string;
  onClose: () => void;
  onEmail: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenClient: (id: string) => void;
}

export function StaffDrawer({ userId, onClose, onEmail, onRemove, onOpenClient }: StaffDrawerProps) {
  const data = useData();
  const user = data.users.find((u) => u.id === userId && u.role !== "CLIENT");
  if (!user) return null;

  const w = workloadOf(data, user);
  const list: Array<[string, number]> = [
    ["Assigned clients", w.clients],
    ["Active cases", w.cases],
    ["Open tasks", w.tasks],
    ["Overdue tasks", w.overdue],
    ["Open follow-ups", w.followups],
    ["Open tickets handled", w.tickets],
    ...(user.role === "CSR" ? [] : ([["Document reviews (30 days)", w.reviews]] as Array<[string, number]>)),
  ];
  const clients = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed" && u.csr === user.id);
  const history = data.audit.filter((a) => a.actor === user.id).slice(0, 8);

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={user.name} subtitle={`${ROLE_LABEL[user.role]} · ${user.email}`}>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
        <Badge tone={statusTone(user.status)}>{user.status}</Badge>
      </div>
      <Facts
        items={[
          { label: "Last activity", value: lastActivity(data, user.id) },
          { label: "Invited by", value: user.invitedBy ? userName(data, user.invitedBy) : "Seeded account" },
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
      {clients.length ? (
        <div className="stack-8">
          <span className="flabel">Assigned clients</span>
          <div className="flex flex-wrap gap-1.5">
            {clients.map((c) => (
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
      <div className="stack-8">
        <span className="flabel">Recent activity</span>
        {history.map((a) => (
          <div key={`${a.at}-${a.action}`} className="flex items-start gap-2 text-sm">
            <Badge tone={a.ok ? "ok" : "err"} compact>
              {a.ok ? "Allowed" : "Refused"}
            </Badge>
            <span className="flex-1">{a.action}</span>
            <span className="help">{a.at ? ago(a.at) : a.time}</span>
          </div>
        ))}
        {history.length === 0 ? <span className="help">No recorded activity yet.</span> : null}
      </div>
    </Drawer>
  );
}
