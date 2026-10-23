"use client";

import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { useClientsQuery, useResendInvitationMutation, useUsersQuery } from "@/store/api/people";
import type { User } from "@/types/domain";

/**
 * Invitations not yet accepted. Admin and Manager see every one (from the accounts list); a CSR sees the clients they can
 * reach (the clients list is already scoped to their own), because CSRs cannot list accounts.
 */
export function PendingInvitations() {
  const me = useMe();
  const run = useAction();
  const [resend, { isLoading, originalArgs }] = useResendInvitationMutation();
  const asStaff = me.role === "ADMIN" || me.role === "MANAGER";
  const accounts = useUsersQuery({ status: "INVITED", limit: 100, sort: "createdAt", order: "desc" }, { skip: !asStaff });
  const clients = useClientsQuery({ status: "INVITED", limit: 100 }, { skip: asStaff });
  const query = asStaff ? accounts : clients;
  const pending: User[] = query.data?.items ?? [];

  const send = (u: User) => run(resend(u.id), { success: `Invitation sent again to ${u.email}` });

  return (
    <section id="sec-pend" className="card scroll-mt-4 overflow-hidden">
      <div className="h3 px-3.5 py-3">Pending invitations</div>
      <QueryState query={query} isEmpty={pending.length === 0} empty={{ title: "No pending invitations" }} rows={2}>
        {pending.map((u) => (
          <div key={u.id} className="row">
            <div className="min-w-0 flex-[1_1_200px]">
              <div className="font-medium">{u.name}</div>
              <div className="help">{u.email}</div>
            </div>
            <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
            <span className="help">
              {u.role === "CLIENT" ? `${u.caseId ?? ""} · CSR ${u.csrName ?? "not assigned"}` : `Invited by ${u.invitedByName ?? "—"}`}
            </span>
            <Button size="sm" disabled={isLoading && originalArgs === u.id} onClick={() => void send(u)}>
              {isLoading && originalArgs === u.id ? "Sending…" : "Resend invitation"}
            </Button>
          </div>
        ))}
      </QueryState>
    </section>
  );
}
