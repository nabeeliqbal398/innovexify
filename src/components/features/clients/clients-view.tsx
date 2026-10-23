"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { caseViewFor } from "@/components/features/cases/case-data";
import { EmailDialog, ReassignDialog, RemoveDialog } from "@/components/features/people/person-dialogs";
import { AddFollowupDialog } from "@/components/features/followups/followup-dialogs";
import { AccountActions } from "@/components/features/staff/account-actions";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, Chip, PageHeader, Progress } from "@/components/ui/primitives";
import { STAGES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useStore";
import { ago, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useChangeCsrMutation, useClientQuery, useClientsQuery, useDirectoryQuery, type ListClientsParams } from "@/store/api/people";
import type { User } from "@/types/domain";
import { ClientProfile } from "./client-profile";

type ClientFilter = "" | "due" | "invited" | "waiting";
const FILTERS: ReadonlyArray<{ value: ClientFilter; label: string }> = [
  { value: "", label: "All clients" },
  { value: "due", label: "Follow-up due" },
  { value: "invited", label: "Invitation pending" },
  { value: "waiting", label: "Waiting on client" },
];

const STATUS_TONE = { Active: "ok", Invited: "brand" } as const;
const PAGE_SIZE = 10;
const utcToday = (): string => new Date().toISOString().slice(0, 10);

export function ClientsView({ nav }: ViewProps) {
  const me = useMe();
  const run = useAction();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("");
  const [page, setPage] = useState(1);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [reassign, setReassign] = useState<User | null>(null);
  const [emailFor, setEmailFor] = useState<User | null>(null);
  const [removeFor, setRemoveFor] = useState<User | null>(null);
  const [reminder, setReminder] = useState(false);
  const [assignError, setAssignError] = useState<Record<string, string>>({});
  const search = useDebounced(q.trim(), 300);

  const isCsr = me.role === "CSR";
  const staffTarget = me.role === "ADMIN" || me.role === "MANAGER";
  const todayIso = utcToday();

  const list = useClientsQuery({ search, ...(filter ? { filter } : {}), page, limit: PAGE_SIZE, sort: "name", order: "asc" } satisfies ListClientsParams);
  const rows = list.data?.items ?? [];
  const meta = list.data?.meta;
  const needsCsr = useClientsQuery({ csrId: "none", limit: 20, sort: "createdAt", order: "asc" }, { skip: me.role === "COMPLIANCE" });
  const unassigned = needsCsr.data?.items ?? [];
  const csrs = useDirectoryQuery({ role: "CSR" });
  const [changeCsr, assigning] = useChangeCsrMutation();
  const csrOptions = [
    ...(isCsr ? [{ id: "me", label: "Assign to me" }] : []),
    ...(csrs.data ?? []).filter((c) => !isCsr || c.id !== me.id).map((c) => ({ id: c.id, label: c.name })),
  ];

  const openId = nav.param("client");
  const detail = useClientQuery(openId, { skip: !openId });

  const title = isCsr ? "My clients" : me.role === "COMPLIANCE" ? "Clients / cases" : "Clients";
  const sub = isCsr
    ? "Clients assigned to you, plus new clients who still need a CSR."
    : me.role === "COMPLIANCE"
      ? "Case records for compliance work. Assignments are managed by Admin and Manager."
      : "Accounts, case IDs and CSR assignments.";

  const assign = async (client: User) => {
    const pick = picks[client.id] ?? csrOptions[0]?.id ?? "";
    setAssignError((e) => ({ ...e, [client.id]: "" }));
    const outcome = await run(changeCsr({ id: client.id, csrId: pick }), { success: `${client.name} assigned`, quiet: true });
    if (!outcome.ok && outcome.error.errorCode !== "PERMISSION_DENIED") setAssignError((e) => ({ ...e, [client.id]: outcome.error.message }));
  };

  return (
    <div className="stack-16">
      <PageHeader
        title={title}
        description={sub}
        actions={
          <>
            {isCsr ? (
              <Button onClick={() => setReminder(true)}>
                <Icon name="clock" small />
                Add follow-up
              </Button>
            ) : null}
            {can(me, "inviteCLIENT") ? (
              <Button variant="primary" onClick={() => nav.go("staff", { query: { invite: "CLIENT" } })}>
                <Icon name="userPlus" small />
                Invite client
              </Button>
            ) : null}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Search clients"
          placeholder="Search name, email or case ID"
          className="max-w-[320px] flex-[1_1_220px]"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <div role="group" aria-label="Client filters" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              active={filter === f.value}
              onClick={() => {
                setFilter(f.value);
                setPage(1);
              }}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {unassigned.length > 0 && me.role !== "COMPLIANCE" ? (
        <Card className="border-[#FDE68A] dark:border-warning/40">
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
            <span className="h3">Needs a CSR</span>
            <Badge tone="warn">{needsCsr.data?.meta.total ?? unassigned.length}</Badge>
            <span className="help">New clients without an assigned CSR.</span>
          </div>
          {unassigned.map((c) => {
            const allowed = can(me, "assignNewClient", { csr: null });
            return (
              <div key={c.id} className="row">
                <div className="flex-[1_1_200px]">
                  <div className="font-semibold">{c.name}</div>
                  <div className="help">
                    <span className="mono">{c.caseId}</span> · {c.email} · {c.status}
                  </div>
                  {assignError[c.id] ? (
                    <div role="alert" className="errtxt">
                      {assignError[c.id]}
                    </div>
                  ) : null}
                </div>
                {allowed ? (
                  <>
                    <Select
                      aria-label={`CSR for ${c.name}`}
                      className="w-auto"
                      value={picks[c.id] ?? csrOptions[0]?.id ?? ""}
                      onChange={(e) => setPicks((p) => ({ ...p, [c.id]: e.target.value }))}
                    >
                      {csrOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" variant="primary" disabled={assigning.isLoading} onClick={() => void assign(c)}>
                      Assign
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="locked" onClick={() => void assign(c)}>
                    <Icon name="lock" small />
                    Assign CSR
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      ) : null}

      {openId && detail.data ? (
        <ClientProfile
          key={detail.data.id}
          client={detail.data}
          onClose={() => nav.setParams({ client: undefined })}
          onOpenCase={(caseId) => nav.go(caseViewFor(me.role), { id: caseId })}
        />
      ) : null}
      {openId && detail.isError ? (
        <Card>
          <QueryState query={detail} isEmpty={false} empty={{ title: "" }}>
            {null}
          </QueryState>
        </Card>
      ) : null}

      <Card>
        <QueryState query={list} isEmpty={rows.length === 0} empty={{ title: "No clients match", text: "Clear the search or choose another filter." }} rows={6}>
          <div className="tbl-wrap">
            <table className="data stack min-w-[1100px]">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Case ID</th>
                  <th scope="col">Status</th>
                  {!isCsr ? <th scope="col">Assigned CSR</th> : null}
                  <th scope="col">Case</th>
                  <th scope="col">Last contact</th>
                  <th scope="col">Next follow-up</th>
                  <th scope="col">Onboarding</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const project = c.currentCase;
                  const ob = c.onboarding ?? { done: 0, total: 5 };
                  const nf = c.nextFollowUp;
                  const open = openId === c.id;
                  const canReassign = can(me, "reassignClient", c);
                  return (
                    <tr key={c.id} className={open ? "is-active" : undefined}>
                      <td className="tl-left">
                        <div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-1 font-semibold"
                            aria-expanded={open}
                            title="Show client profile"
                            onClick={() => nav.setParams({ client: open ? undefined : c.id })}
                          >
                            {c.name}
                          </Button>
                          <div className="help pl-1">{c.email}</div>
                          <div className="help pl-1">{c.phone || "No phone on file"}</div>
                        </div>
                      </td>
                      <td data-label="Case ID" className="mono whitespace-nowrap text-sm">
                        {c.caseId}
                      </td>
                      <td data-label="Status">
                        <Badge tone={STATUS_TONE[c.status as keyof typeof STATUS_TONE] ?? "err"}>{c.status}</Badge>
                      </td>
                      {!isCsr ? (
                        <td data-label="Assigned CSR" className="whitespace-nowrap">
                          {c.csrName ?? "Unassigned"}
                        </td>
                      ) : null}
                      <td data-label="Case" className="min-w-[190px] text-sm">
                        <div>{project ? `${STAGES[project.stageIdx]} · ${project.display}` : "No project yet"}</div>
                        <div className="help">{project ? (project.stageIdx < 10 ? `Next: ${STAGES[project.stageIdx + 1]}` : "Completed") : "No case yet"}</div>
                      </td>
                      <td data-label="Last contact" className="help whitespace-nowrap">
                        {c.lastContactAt ? ago(c.lastContactAt) : "No contact yet"}
                      </td>
                      <td data-label="Next follow-up" className={`min-w-[120px] text-sm ${nf && nf.due <= todayIso ? "font-semibold text-danger-hover" : ""}`}>
                        {nf ? `${fmtDay(nf.due)} · ${nf.type}` : "None scheduled"}
                      </td>
                      <td data-label="Onboarding">
                        <div className="flex min-w-[90px] items-center gap-1.5" title="Onboarding steps completed">
                          <Progress value={Math.round((ob.done / Math.max(1, ob.total)) * 100)} label={`Onboarding ${ob.done}/${ob.total}`} className="flex-1" />
                          <span className="mono help">
                            {ob.done}/{ob.total}
                          </span>
                        </div>
                      </td>
                      <td data-label="Actions">
                        <div className="flex flex-wrap gap-1">
                          {project ? (
                            <Button size="sm" onClick={() => nav.go(caseViewFor(me.role), { id: project.id })}>
                              Case
                            </Button>
                          ) : null}
                          {can(me, "conversation", { id: c.id, csr: c.csr }) ? (
                            <Button size="sm" onClick={() => nav.go("messages", { query: { c: c.id } })}>
                              Message
                            </Button>
                          ) : null}
                          {c.csr && staffTarget ? (
                            <Button size="sm" variant={canReassign ? "default" : "locked"} onClick={() => setReassign(c)}>
                              {canReassign ? null : <Icon name="lock" small />}
                              Reassign CSR
                            </Button>
                          ) : null}
                          {staffTarget ? <AccountActions user={c} onEmail={setEmailFor} onRemove={setRemoveFor} /> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </QueryState>
        {meta ? (
          <Pager
            page={meta.page - 1}
            pageCount={meta.totalPages}
            total={meta.total}
            pageSize={PAGE_SIZE}
            noun="clients"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        ) : null}
      </Card>

      <ReassignDialog user={reassign} onClose={() => setReassign(null)} />
      <EmailDialog user={emailFor} onClose={() => setEmailFor(null)} />
      <RemoveDialog user={removeFor} onClose={() => setRemoveFor(null)} />
      {reminder ? <AddFollowupDialog onClose={() => setReminder(false)} /> : null}
    </div>
  );
}
