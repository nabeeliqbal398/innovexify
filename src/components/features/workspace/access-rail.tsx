"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/constants/vocab";
import { ACCESS_MATRIX, can } from "@/lib/permissions";
import { useAppDispatch, useAppSelector, useMe } from "@/hooks/useStore";
import { PROBES, resetDemo, runProbe } from "@/store/actions/comms";
import { cn } from "@/lib/cn";

/** What this role can do, direct-request probes, and the demo reset. */
export function AccessRail() {
  const me = useMe();
  const dispatch = useAppDispatch();
  const probeLog = useAppSelector((s) => s.workspace.probeLog);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <aside
      aria-label="Access and scenarios"
      className="flex max-w-[360px] flex-[1_1_320px] flex-col gap-3.5 border-l border-border bg-surface p-4 max-[1180px]:max-w-none max-[1180px]:border-l-0 max-[1180px]:border-t"
    >
      <p className="help">
        Prototype with fictional people. Permissions are enforced in the browser, emails and files are simulated, and everything resets on reload.
      </p>
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
        <span className="help">Rules live in one permission table and every action checks it, not just the buttons.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="h3">Simulate a direct request</span>
        <span className="help">
          Bypasses the UI and asks the permission check directly, like a crafted URL or API call. Nothing changes.
        </span>
        {PROBES.map((p) => (
          <Button
            key={p.kind}
            size="sm"
            onClick={() => dispatch(runProbe(p.kind))}
            className="h-auto min-h-7 justify-start whitespace-normal px-[9px] py-[5px] text-left"
          >
            {p.label}
          </Button>
        ))}
        <div aria-live="polite" className="flex flex-col gap-1.5">
          {probeLog.map((l, i) => (
            <div key={`${l.label}-${i}`} className="flex items-center gap-1.5 text-xs">
              <Badge compact tone={l.ok ? "ok" : "err"}>
                {l.ok ? "Allowed" : "Refused"}
              </Badge>
              <span>
                {l.role}: {l.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <Button size="sm" onClick={() => setConfirmReset(true)}>
        Reset demo
      </Button>
      <Modal open={confirmReset} onOpenChange={setConfirmReset} title="Reset demo data?">
        <Callout tone="warn" icon="alert">
          Everything returns to the seeded starting data.
        </Callout>
        <ModalFooter>
          <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              dispatch(resetDemo());
              setConfirmReset(false);
            }}
          >
            Reset demo
          </Button>
        </ModalFooter>
      </Modal>
    </aside>
  );
}
