"use client";

import { useState } from "react";

import { caseViewFor, clientUsers } from "@/components/features/cases/case-data";
import { EmailDialog, ReassignDialog, RemoveDialog } from "@/components/features/people/person-dialogs";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, Chip, EmptyState, PageHeader, Progress } from "@/components/ui/primitives";
import { STAGES } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { ago, dISO, fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { openCaseCheck } from "@/store/actions/cases";
import { check } from "@/store/actions/core";
import { openConversation } from "@/store/actions/comms";
import { assignCsr, requestEmailChange, requestReassign, requestRemove, toggleSuspend } from "@/store/actions/people";
import { projectOfClient, userName } from "@/store/selectors";
import type { User } from "@/types/domain";
import { lastContact, nextFollowup, onboarding } from "./client-data";
import { ClientProfile } from "./client-profile";
import { ReminderDialog } from "./followup-dialogs";

type ClientFilter = "" | "due" | "invited" | "waiting";
const FILTERS: ReadonlyArray<{ value: ClientFilter; label: string }> = [
  { value: "", label: "All clients" },
  { value: "due", label: "Follow-up due" },
  { value: "invited", label: "Invitation pending" },
  { value: "waiting", label: "Waiting on client" },
];

const STATUS_TONE = { Active: "ok", Invited: "brand" } as const;

export function ClientsView({ nav }: ViewProps) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [emailId, setEmailId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [reminder, setReminder] = useState(false);
  const [assignError, setAssignError] = useState<Record<string, string>>({});

  const isCsr = me.role === "CSR";
  const staffTarget = me.role === "ADMIN" || me.role === "MANAGER";
  const todayIso = dISO(0);
  const query = q.trim().toLowerCase();

  const visible = clientUsers(data).filter((c) => can(me, "viewClient", c));
  const unassigned = visible.filter((c) => !c.csr);
  const activeCsrs = data.users.filter((u) => u.role === "CSR" && u.status === "Active");
  const csrOptions = [
    ...(isCsr ? [{ id: "me", label: "Assign to me" }] : []),
    ...activeCsrs.filter((c) => !isCsr || c.id !== me.id).map((c) => ({ id: c.id, label: c.name })),
  ];

  const waiting = (c: User) => {
    const project = projectOfClient(data, c.id);
    return data.docs.some((d) => d.client === c.id && ["requested", "rejected", "info"].includes(d.status)) || project?.status === "Awaiting Client";
  };
  const rows = visible
    .filter((c) => !query || `${c.name} ${c.email} ${c.caseId}`.toLowerCase().includes(query))
    .filter((c) => !isCsr || c.csr === me.id)
    .filter((c) => {
      if (filter === "due") {
        const nf = nextFollowup(data, c);
        return Boolean(nf) && (nf?.due ?? "") <= todayIso;
      }
      if (filter === "invited") return c.status === "Invited";
      if (filter === "waiting") return waiting(c);
      return true;
    });

  const openId = nav.param("client");
  const detail = visible.find((c) => c.id === openId);

  const title = isCsr ? "My clients" : me.role === "COMPLIANCE" ? "Clients / cases" : "Clients";
  const sub = isCsr
    ? "Clients assigned to you, plus new clients who still need a CSR."
    : me.role === "COMPLIANCE"
      ? "Case records for compliance work. Assignments are managed by Admin and Manager."
      : "Accounts, case IDs and CSR assignments.";

  const openCase = (projectId: string) => {
    if (dispatch(openCaseCheck(projectId))) nav.go(caseViewFor(me.role), { id: projectId });
  };
  const message = (id: string) => {
    if (dispatch(openConversation(id))) nav.go("messages", { query: { c: id } });
  };
  const assign = (client: User) => {
    const pick = picks[client.id] ?? csrOptions[0]?.id ?? "";
    const result = dispatch(assignCsr(client.id, pick));
    setAssignError((e) => ({ ...e, [client.id]: result.ok ? "" : (result.error ?? "") }));
  };
  const addFollowup = () => {
    if (dispatch(check("followups", undefined, "Open add follow-up", ""))) setReminder(true);
  };

  return (
    <div className="stack-16">
      <PageHeader
        title={title}
        description={sub}
        actions={
          <>
            {isCsr ? (
              <Button onClick={addFollowup}>
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
          onChange={(e) => setQ(e.target.value)}
        />
        <div role="group" aria-label="Client filters" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {unassigned.length > 0 && me.role !== "COMPLIANCE" ? (
        <Card className="border-[#FDE68A] dark:border-warning/40">
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
            <span className="h3">Needs a CSR</span>
            <Badge tone="warn">{unassigned.length}</Badge>
            <span className="help">New clients without an assigned CSR.</span>
          </div>
          {unassigned.map((c) => {
            const allowed = can(me, "assignNewClient", c);
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
                    <Button size="sm" variant="primary" onClick={() => assign(c)}>
                      Assign
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="locked" onClick={() => assign(c)}>
                    <Icon name="lock" small />
                    Assign CSR
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      ) : null}

      {detail ? (
        <ClientProfile
          key={detail.id}
          client={detail}
          onClose={() => nav.setParams({ client: undefined })}
          onOpenCase={openCase}
        />
      ) : null}

      <Card>
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
                const project = projectOfClient(data, c.id);
                const ob = onboarding(data, c);
                const lc = lastContact(data, c);
                const nf = nextFollowup(data, c);
                const open = openId === c.id;
                const canReassign = can(me, "reassignClient", c);
                const canRemove = can(me, "removeUser", c);
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
                        {c.csr ? userName(data, c.csr) : "Unassigned"}
                      </td>
                    ) : null}
                    <td data-label="Case" className="min-w-[190px] text-sm">
                      <div>{project ? `${STAGES[project.stageIdx]} · ${project.id}` : "No project yet"}</div>
                      <div className="help">{project ? (project.stageIdx < 10 ? `Next: ${STAGES[project.stageIdx + 1]}` : "Completed") : "No case yet"}</div>
                    </td>
                    <td data-label="Last contact" className="help whitespace-nowrap">
                      {lc ? ago(lc) : "No contact yet"}
                    </td>
                    <td
                      data-label="Next follow-up"
                      className={`min-w-[120px] text-sm ${nf && nf.due <= todayIso ? "font-semibold text-danger-hover" : ""}`}
                    >
                      {nf ? `${fmtDay(nf.due)} · ${nf.type}` : "None scheduled"}
                    </td>
                    <td data-label="Onboarding">
                      <div className="flex min-w-[90px] items-center gap-1.5" title="Onboarding steps completed">
                        <Progress value={ob.pct} label={`Onboarding ${ob.label}`} className="flex-1" />
                        <span className="mono help">{ob.label}</span>
                      </div>
                    </td>
                    <td data-label="Actions">
                      <div className="flex flex-nowrap gap-1">
                        {project ? (
                          <Button size="sm" onClick={() => openCase(project.id)}>
                            Case
                          </Button>
                        ) : null}
                        {can(me, "conversation", c) ? (
                          <Button size="sm" onClick={() => message(c.id)}>
                            Message
                          </Button>
                        ) : null}
                        {c.csr ? (
                          <Button
                            size="sm"
                            variant={canReassign ? "default" : "locked"}
                            onClick={() => dispatch(requestReassign(c.id)) && setReassignId(c.id)}
                          >
                            {canReassign ? null : <Icon name="lock" small />}
                            Reassign CSR
                          </Button>
                        ) : null}
                        {staffTarget && can(me, "updateEmail", c) ? (
                          <Button size="sm" onClick={() => dispatch(requestEmailChange(c.id)) && setEmailId(c.id)}>
                            Edit email
                          </Button>
                        ) : null}
                        {staffTarget && can(me, "suspendUser", c) ? (
                          <Button size="sm" onClick={() => dispatch(toggleSuspend(c.id))}>
                            {c.status === "Suspended" ? "Reactivate" : "Suspend"}
                          </Button>
                        ) : null}
                        {staffTarget ? (
                          <Button
                            size="sm"
                            variant={canRemove ? "bad" : "locked"}
                            onClick={() => dispatch(requestRemove(c.id)) && setRemoveId(c.id)}
                          >
                            {canRemove ? null : <Icon name="lock" small />}
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <EmptyState title="No clients match" text="Clear the search or choose another filter." /> : null}
      </Card>

      <ReassignDialog userId={reassignId} onClose={() => setReassignId(null)} />
      <EmailDialog userId={emailId} onClose={() => setEmailId(null)} />
      <RemoveDialog userId={removeId} onClose={() => setRemoveId(null)} />
      {reminder ? <ReminderDialog clientId="" onClose={() => setReminder(false)} /> : null}
    </div>
  );
}
