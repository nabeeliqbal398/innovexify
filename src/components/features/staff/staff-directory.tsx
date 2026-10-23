"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { AccountActions } from "@/components/features/staff/account-actions";
import { statusTone } from "@/components/features/staff/workload";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
import { ROLE_LABEL, ROLE_TONE } from "@/constants/vocab";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useStore";
import { ago, plural } from "@/lib/dates";
import { useUsersQuery } from "@/store/api/people";
import type { Role, User } from "@/types/domain";

const PAGE_SIZE = 10;

interface StaffDirectoryProps {
  onOpen: (id: string) => void;
  onEmail: (user: User) => void;
  onRemove: (user: User) => void;
}

export function lastActivity(user: User): string {
  return user.lastActivityAt ? ago(user.lastActivityAt) : "No activity yet";
}

function loadText(user: User): string {
  const w = user.workload;
  if (!w) return "—";
  if (user.role === "CSR") return `${w.clients} clients · ${plural(w.openFollowUps, "follow-up")}`;
  if (user.role === "COMPLIANCE") return `${w.cases} cases · ${plural(w.openTasks, "task")}`;
  return plural(w.openTasks, "open task");
}

const STATUS_PARAM: Record<string, string> = { Active: "ACTIVE", Invited: "INVITED", Suspended: "SUSPENDED" };

export function StaffDirectory({ onOpen, onEmail, onRemove }: StaffDirectoryProps) {
  const me = useMe();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(query.trim(), 300);

  const result = useUsersQuery(
    { search, status: STATUS_PARAM[status], page, limit: PAGE_SIZE, sort: "name", order: "asc", staff: true, ...(role ? { role } : {}) },
    { refetchOnMountOrArgChange: true },
  );
  const rows = result.data?.items ?? [];
  const meta = result.data?.meta;

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
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <Select
            aria-label="Filter by role"
            className="w-auto"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role | "");
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="CSR">CSR</option>
            <option value="COMPLIANCE">Compliance</option>
          </Select>
          <Select
            aria-label="Filter by status"
            className="w-auto"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            <option>Active</option>
            <option>Invited</option>
            <option>Suspended</option>
          </Select>
        </div>
      </div>
      <QueryState query={result} isEmpty={rows.length === 0} empty={{ title: "No staff match", text: "Clear the search or filters." }}>
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
                    {loadText(u)}
                  </td>
                  <td data-label="Last activity" className="help whitespace-nowrap">
                    {lastActivity(u)}
                  </td>
                  <td data-label="Actions">
                    <AccountActions user={u} onEmail={onEmail} onRemove={onRemove} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {meta ? (
          <Pager
            page={meta.page - 1}
            pageCount={meta.totalPages}
            total={meta.total}
            pageSize={PAGE_SIZE}
            noun="accounts"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        ) : null}
      </QueryState>
      <p className="help px-3.5 py-2.5">
        Locked buttons explain the rule when selected. Only Admin can remove users; Managers can&apos;t change Admin or other Manager accounts.
      </p>
    </section>
  );
}
