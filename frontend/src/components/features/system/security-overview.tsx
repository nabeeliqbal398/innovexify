"use client";

import { useRouter } from "next/navigation";

import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Facts } from "@/components/ui/primitives";
import { ROLE_LABEL, type BadgeTone } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { flash } from "@/lib/toast";
import { signOut } from "@/lib/session";
import { useLogoutAllMutation } from "@/store/api/auth";
import { useAccessMatrixQuery } from "@/store/api/system";
import type { Role } from "@/types/domain";

const ROLES: readonly Role[] = ["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"];

interface Control {
  name: string;
  now: string;
  prod: string;
  state: string;
  tone: BadgeTone;
}

/** What the platform does today and what a production deployment still has to add (see GO-LIVE.md). */
const CONTROLS: readonly Control[] = [
  {
    name: "Role-based permissions",
    now: "One permission table checked by the server on every request. A crafted request is refused and logged.",
    prod: "Nothing more: review the table when roles change.",
    state: "Enforced by the server",
    tone: "ok",
  },
  {
    name: "Audit log",
    now: "Written by the server on the same transaction as each action. The API has no way to edit or delete an entry.",
    prod: "A retention and archive policy, and database-level protection against direct edits.",
    state: "Append-only in the API",
    tone: "ok",
  },
  {
    name: "Document access",
    now: "Scoped by role; files live outside the web root under random names, with type checks. CSRs are refused and the attempt is logged.",
    prod: "Encryption at rest, backups, and a real virus scanner behind the scanner interface.",
    state: "Needs infrastructure",
    tone: "warn",
  },
  {
    name: "Sign-in and sessions",
    now: "Argon2id passwords, 15-minute access tokens, single-use rotating refresh tokens with reuse detection, lockout after repeated failures.",
    prod: "Two-factor sign-in and password reset by email are not built yet.",
    state: "Implemented, no MFA",
    tone: "warn",
  },
  {
    name: "Email notifications",
    now: "Sent through the mail service, switchable per trigger. Security emails are always on.",
    prod: "Connect an SMTP or API provider (the development mailer only writes to the log).",
    state: "Needs infrastructure",
    tone: "warn",
  },
  {
    name: "Data isolation",
    now: "Every query carries the caller's scope: a client sees only their own records, a CSR only their clients'.",
    prod: "Nothing more for one company; row-level rules would be needed for several tenants.",
    state: "Enforced by the server",
    tone: "ok",
  },
];

export function SecurityOverview() {
  const me = useMe();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const run = useAction();
  const matrix = useAccessMatrixQuery();
  const [logoutAll, ending] = useLogoutAllMutation();

  const endOthers = async () => {
    const outcome = await run(logoutAll());
    if (!outcome.ok) return;
    flash(`Signed out of ${outcome.data.sessionsEnded} session${outcome.data.sessionsEnded === 1 ? "" : "s"}, including this one.`);
    await signOut(dispatch, "You signed out of every device. Sign in again to continue.");
    router.replace("/");
  };

  return (
    <>
      <div className="grid2">
        <section className="card card-b">
          <span className="h3">Current session</span>
          <Facts
            items={[
              { label: "Signed in as", value: me.name },
              { label: "Email", value: me.email },
              { label: "Role", value: ROLE_LABEL[me.role] },
            ]}
          />
          <p className="help">The access token lives in memory only and renews itself. Signing out everywhere ends every session of this account on every device.</p>
          <div>
            <Button size="sm" variant="danger" disabled={ending.isLoading} onClick={() => void endOthers()}>
              {ending.isLoading ? "Signing out…" : "Sign out everywhere"}
            </Button>
          </div>
        </section>
        <section className="card overflow-hidden">
          <div className="card-h">
            <span className="h3">Access policy (the server&apos;s permission table)</span>
          </div>
          <QueryState query={matrix} isEmpty={(matrix.data?.rows.length ?? 0) === 0} empty={{ title: "No policy loaded" }} rows={4}>
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
                  {matrix.data?.rows.map((row) => (
                    <tr key={row.permission}>
                      <td className="text-[13px]">{row.label}</td>
                      {ROLES.map((r) => {
                        const ok = row.roles.includes(r);
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
          </QueryState>
          <p className="help px-3.5 pb-3 pt-2">
            Resource rules (a client&apos;s own records, a CSR&apos;s own clients, protected accounts) apply on top of this table.
          </p>
        </section>
      </div>
      <section className="card overflow-hidden">
        <div className="card-h">
          <span className="h3">Controls: what is in place and what production still needs</span>
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
              <div className="flabel">In place</div>
              <div className="mini">{c.now}</div>
            </div>
            <div className="flex-[1_1_240px]">
              <div className="flabel">Still needed for production</div>
              <div className="mini">{c.prod}</div>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
