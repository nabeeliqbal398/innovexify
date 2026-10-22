"use client";

import { useState } from "react";

import { AccountActions } from "@/components/features/staff/account-actions";
import { statusTone, workloadOf } from "@/components/features/staff/workload";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/primitives";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useData, useMe } from "@/hooks/useStore";
import { ago, plural } from "@/lib/dates";
import type { DemoData, Role, User } from "@/types/domain";

interface StaffDirectoryProps {
  onOpen: (id: string) => void;
  onEmail: (id: string) => void;
  onRemove: (id: string) => void;
}

export function lastActivity(data: DemoData, userId: string): string {
  const entry = data.audit.find((a) => a.actor === userId && a.ok);
  if (!entry) return "No activity yet";
  return entry.at ? ago(entry.at) : entry.time;
}

function loadText(data: DemoData, user: User): string {
  const w = workloadOf(data, user);
  if (user.role === "CSR") return `${w.clients} clients · ${plural(w.followups, "follow-up")}`;
  if (user.role === "COMPLIANCE") return `${w.cases} cases · ${plural(w.tasks, "task")}`;
  return plural(w.tasks, "open task");
}

export function StaffDirectory({ onOpen, onEmail, onRemove }: StaffDirectoryProps) {
  const data = useData();
  const me = useMe();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [status, setStatus] = useState("");

  const q = query.trim().toLowerCase();
  const rows = data.users
    .filter((u) => u.role !== "CLIENT" && u.status !== "Removed")
    .filter((u) => (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)) && (!role || u.role === role) && (!status || u.status === status));

  return (
    <section id="sec-dir" className="card scroll-mt-4 overflow-hidden">
      <div className="card-h">
        <span className="h3 flex-1">Staff directory</span>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            aria-label="Search staff"
            placeholder="Search name or email"
            className="w-[220px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select aria-label="Filter by role" className="w-auto" value={role} onChange={(e) => setRole(e.target.value as Role | "")}>
            <option value="">All roles</option>
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="CSR">CSR</option>
            <option value="COMPLIANCE">Compliance</option>
          </Select>
          <Select aria-label="Filter by status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option>Active</option>
            <option>Invited</option>
            <option>Suspended</option>
          </Select>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="data stack min-w-[980px]">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Workload</th>
              <th scope="col">Last activity</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="tl-left">
                  <button type="button" className="linkb" title="Open staff details" onClick={() => onOpen(u.id)}>
                    {u.name}
                    {u.id === me.id ? " (you)" : ""}
                  </button>
                </td>
                <td data-label="Role">
                  <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                </td>
                <td data-label="Email" className="text-sm">
                  {u.email}
                </td>
                <td data-label="Status">
                  <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                </td>
                <td data-label="Workload" className="mini">
                  {loadText(data, u)}
                </td>
                <td data-label="Last activity" className="help whitespace-nowrap">
                  {lastActivity(data, u.id)}
                </td>
                <td data-label="Actions">
                  <AccountActions user={u} onEmail={onEmail} onRemove={onRemove} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <EmptyState title="No staff match" text="Clear the search or filters." /> : null}
      <p className="help px-3.5 py-2.5">
        Locked buttons explain the rule when selected. Only Admin can remove users; Managers can&apos;t change Admin or other Manager accounts.
      </p>
    </section>
  );
}
