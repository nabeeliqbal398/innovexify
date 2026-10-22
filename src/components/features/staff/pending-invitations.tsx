"use client";

import { pendingInvitations } from "@/components/features/staff/workload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { acceptInvitation } from "@/store/actions/people";
import { userName } from "@/store/selectors";

export function PendingInvitations() {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const pending = pendingInvitations(data, me);

  return (
    <section id="sec-pend" className="card scroll-mt-4 overflow-hidden">
      <div className="h3 px-3.5 py-3">Pending invitations</div>
      {pending.map((u) => (
        <div key={u.id} className="row">
          <div className="min-w-0 flex-[1_1_200px]">
            <div className="font-medium">{u.name}</div>
            <div className="help">{u.email}</div>
          </div>
          <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
          <span className="help">
            {u.role === "CLIENT" ? `${u.caseId ?? ""} · CSR ${userName(data, u.csr)}` : `Invited by ${userName(data, u.invitedBy)}`}
          </span>
          <Button size="sm" onClick={() => dispatch(acceptInvitation(u.id))}>
            Simulate acceptance
          </Button>
        </div>
      ))}
      {pending.length === 0 ? <div className="row help">No pending invitations.</div> : null}
    </section>
  );
}
