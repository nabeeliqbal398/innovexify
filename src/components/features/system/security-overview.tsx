"use client";

import { Badge } from "@/components/ui/badge";
import { Facts } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/constants/vocab";
import { useMe } from "@/hooks/useStore";
import { ago, fmtAt } from "@/lib/dates";
import { ACCESS_MATRIX, can } from "@/lib/permissions";
import type { BadgeTone } from "@/constants/vocab";
import type { Role, User } from "@/types/domain";

const ROLES: readonly Role[] = ["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"];

const probe = (role: Role): User => ({ id: "x", name: "", email: "", role, status: "Active" });

interface Control {
  name: string;
  now: string;
  prod: string;
  state: string;
  tone: BadgeTone;
}

const CONTROLS: readonly Control[] = [
  {
    name: "Role-based permissions",
    now: "One permission table checked inside every action handler. Direct calls are refused and logged.",
    prod: "Same rules enforced on the server for every API request.",
    state: "Implemented in prototype",
    tone: "ok",
  },
  {
    name: "Audit log",
    now: "Records allowed and refused actions in this browser session. It can be cleared by Reset and is not tamper-proof.",
    prod: "Append-only storage with retention, export and integrity checks.",
    state: "Prototype only",
    tone: "warn",
  },
  {
    name: "Document access",
    now: "CSRs and other clients are refused before any preview or download. Files are never stored here.",
    prod: "Encrypted storage and short-lived, permission-checked download links.",
    state: "Simulated",
    tone: "warn",
  },
  {
    name: "Sign-in and sessions",
    now: "The user switcher stands in for sign-in; switching is logged. No passwords are checked.",
    prod: "Password policy, MFA, session timeout and device management.",
    state: "Not implemented",
    tone: "q",
  },
  {
    name: "Email notifications",
    now: "In-app notifications only. No email leaves this prototype.",
    prod: "Transactional email with delivery tracking and security notices.",
    state: "Not implemented",
    tone: "q",
  },
  {
    name: "Data isolation",
    now: "Each client sees only their own case, documents, tickets and messages.",
    prod: "Tenant and row-level access rules in the database.",
    state: "Implemented in prototype",
    tone: "ok",
  },
];

export function SecurityOverview({ sessionStartedAt }: { sessionStartedAt: number }) {
  const me = useMe();

  return (
    <>
      <div className="grid2">
        <section className="card card-b">
          <span className="h3">Current session</span>
          <Facts
            items={[
              { label: "Signed in as", value: me.name },
              { label: "Role", value: ROLE_LABEL[me.role] },
              { label: "Session started", value: fmtAt(sessionStartedAt) },
              { label: "Session age", value: ago(sessionStartedAt) },
            ]}
          />
          <p className="help">
            Sign-in is simulated by the user switcher. Production adds password policy, MFA and idle timeout.
          </p>
        </section>
        <section className="card overflow-hidden">
          <div className="card-h">
            <span className="h3">Access policy (from the live permission table)</span>
          </div>
          <div className="tbl-wrap">
            <table className="data min-w-[520px]">
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  {ROLES.map((r) => (
                    <th key={r} scope="col">
                      {ROLE_LABEL[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACCESS_MATRIX.map(([label, perm]) => (
                  <tr key={perm}>
                    <td className="text-[13px]">{label}</td>
                    {ROLES.map((r) => {
                      const ok = can(probe(r), perm, perm === "docsAccess" && r === "CLIENT" ? { client: "x" } : undefined);
                      return (
                        <td key={r}>
                          <span aria-hidden="true" className={ok ? "font-bold text-success" : "font-bold text-danger"}>
                            {ok ? "✓" : "✕"}
                          </span>
                          <span className="sr-only">
                            {ROLE_LABEL[r]} {ok ? "allowed" : "not allowed"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="help px-3.5 pb-3 pt-2">
            Clients can open their own documents only. Resource rules (own clients, own reports, protected accounts)
            apply on top of this table.
          </p>
        </section>
      </div>
      <section className="card overflow-hidden">
        <div className="card-h">
          <span className="h3">Controls: prototype versus production</span>
        </div>
        {CONTROLS.map((c) => (
          <div key={c.name} className="row items-start">
            <div className="min-w-[160px] flex-[0_1_200px] font-semibold">
              {c.name}
              <div className="mt-1">
                <Badge tone={c.tone}>{c.state}</Badge>
              </div>
            </div>
            <div className="flex-[1_1_240px]">
              <div className="flabel">In this prototype</div>
              <div className="mini">{c.now}</div>
            </div>
            <div className="flex-[1_1_240px]">
              <div className="flabel">Needed for production</div>
              <div className="mini">{c.prod}</div>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
