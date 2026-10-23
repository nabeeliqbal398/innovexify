"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/constants/vocab";
import { cn } from "@/lib/cn";
import { ACCESS_MATRIX, can } from "@/lib/permissions";
import { useMe } from "@/hooks/useStore";
import { PROBES, useProbeMutation } from "@/store/api/probes";

/** Set NEXT_PUBLIC_ENABLE_DEMO_TOOLS=true to show the direct-request buttons (they rely on the seeded demo records). */
const DEMO_TOOLS = process.env.NEXT_PUBLIC_ENABLE_DEMO_TOOLS === "true";

interface ProbeEntry {
  role: string;
  label: string;
  status: number;
}

/** What this role can do, and (with demo tools on) direct requests that the server decides and audits. */
export function AccessRail() {
  const me = useMe();
  const [probe, state] = useProbeMutation();
  const [log, setLog] = useState<ProbeEntry[]>([]);

  const run = async (kind: (typeof PROBES)[number]["kind"], label: string): Promise<void> => {
    const result = await probe(kind).unwrap();
    setLog((l) => [{ role: ROLE_LABEL[me.role], label, status: result.status }, ...l].slice(0, 5));
  };

  return (
    <aside
      aria-label="Access and scenarios"
      className="flex max-w-[360px] flex-[1_1_320px] flex-col gap-3.5 border-l border-border bg-surface p-4 max-[1180px]:max-w-none max-[1180px]:border-l-0 max-[1180px]:border-t"
    >
      <p className="help">Permissions are decided by the server on every request. The list below mirrors its permission table to show or hide buttons.</p>
      <div className="flex flex-col gap-1.5">
        <span className="h3">What {ROLE_LABEL[me.role]} can do</span>
        <ul className="m-0 list-none p-0">
          {ACCESS_MATRIX.map(([label, perm]) => {
            const ok = can(me, perm);
            return (
              <li key={perm} className="flex items-center gap-2 py-[3px] text-sm">
                <span aria-hidden="true" className={cn("w-4 font-bold", ok ? "text-success" : "text-muted-foreground")}>
                  {ok ? "✓" : "✕"}
                </span>
                <span className={cn("flex-1", !ok && "text-muted-foreground line-through")}>{label}</span>
                <span className="sr-only">{ok ? "Allowed" : "Not allowed"}</span>
              </li>
            );
          })}
        </ul>
        <span className="help">Every request is checked against one permission table on the server, not just the buttons.</span>
      </div>
      {DEMO_TOOLS ? (
        <div className="flex flex-col gap-1.5">
          <span className="h3">Simulate a direct request</span>
          <span className="help">
            Sends a real request that skips the screens, like a crafted URL or API call. The server decides and a refusal is written to the audit log. A request that is
            allowed changes nothing.
          </span>
          {PROBES.map((p) => (
            <Button
              key={p.kind}
              size="sm"
              disabled={state.isLoading}
              onClick={() => void run(p.kind, p.label)}
              className="h-auto min-h-7 justify-start whitespace-normal px-[9px] py-[5px] text-left"
            >
              {p.label}
            </Button>
          ))}
          <div aria-live="polite" className="flex flex-col gap-1.5">
            {log.map((l, i) => (
              <div key={`${l.label}-${i}`} className="flex items-center gap-1.5 text-xs">
                <Badge compact tone={l.status === 403 ? "err" : "ok"}>
                  {l.status === 403 ? "Refused" : "Allowed"}
                </Badge>
                <span>
                  {l.role}: {l.label} <span className="help">({l.status})</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
