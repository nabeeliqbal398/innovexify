"use client";

import { useState } from "react";

import { EmailDialog, RemoveDialog } from "@/components/features/people/person-dialogs";
import { InviteForm } from "@/components/features/staff/invite-form";
import { PendingInvitations } from "@/components/features/staff/pending-invitations";
import { StaffDirectory } from "@/components/features/staff/staff-directory";
import { StaffDrawer } from "@/components/features/staff/staff-drawer";
import { StaffWorkload } from "@/components/features/staff/staff-workload";
import type { ViewProps } from "@/components/features/workspace/types";
import { useMe } from "@/hooks/useStore";
import type { User } from "@/types/domain";

const JUMP_CLASS =
  "inline-flex h-7 items-center rounded-full border border-border bg-surface px-2.5 text-xs font-medium text-neutral no-underline hover:bg-muted";

export function StaffView({ nav }: ViewProps) {
  const me = useMe();
  const [emailFor, setEmailFor] = useState<User | null>(null);
  const [removeFor, setRemoveFor] = useState<User | null>(null);

  const showStaff = me.role === "ADMIN" || me.role === "MANAGER";
  const isCsr = me.role === "CSR";
  const title = isCsr ? "Invitations" : me.role === "MANAGER" ? "Team & Workload" : "Staff & Invitations";
  const description = isCsr
    ? "CSRs can invite clients and assign them to themselves or another CSR."
    : me.role === "ADMIN"
      ? "Invite any role, manage staff accounts and emails."
      : "Invite CSRs, Compliance users and clients. Only Admin can invite Managers or remove users.";
  const staffId = showStaff ? nav.param("staff") : "";
  const openStaff = (id: string) => nav.setParams({ staff: id });

  return (
    <div className="stack-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{title}</h1>
          <p className="help">{description}</p>
        </div>
        {showStaff ? (
          <nav aria-label="Jump to section" className="flex flex-wrap gap-1.5">
            <a className={JUMP_CLASS} href="#sec-dir">
              Directory
            </a>
            <a className={JUMP_CLASS} href="#sec-work">
              Workload
            </a>
            <a className={JUMP_CLASS} href="#sec-inv">
              Invite
            </a>
            <a className={JUMP_CLASS} href="#sec-pend">
              Pending
            </a>
          </nav>
        ) : null}
      </div>
      <InviteForm />
      <PendingInvitations />
      {showStaff ? (
        <>
          <StaffDirectory onOpen={openStaff} onEmail={setEmailFor} onRemove={setRemoveFor} />
          <StaffWorkload onOpen={openStaff} />
        </>
      ) : null}
      {staffId ? (
        <StaffDrawer
          userId={staffId}
          onClose={() => nav.setParams({ staff: undefined })}
          onEmail={setEmailFor}
          onRemove={setRemoveFor}
          onOpenClient={(id) => nav.go("clients", { query: { client: id } })}
        />
      ) : null}
      <EmailDialog user={emailFor} onClose={() => setEmailFor(null)} />
      <RemoveDialog user={removeFor} onClose={() => setRemoveFor(null)} />
    </div>
  );
}
