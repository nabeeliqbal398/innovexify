"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useData } from "@/hooks/useStore";
import { ago, dISO, fmtDay, relDay } from "@/lib/dates";
import { userName } from "@/store/selectors";
import type { FollowUp } from "@/types/domain";

interface FollowupRowProps {
  followup: FollowUp;
  showCsr: boolean;
  onComplete: () => void;
  onOpenClient: () => void;
}

export function FollowupRow({ followup: f, showCsr, onComplete, onOpenClient }: FollowupRowProps) {
  const data = useData();
  const client = data.users.find((u) => u.id === f.client);
  const project = data.projects.find((p) => p.client === f.client);
  const today = dISO(0);
  const open = f.status === "Open";
  const late = open && f.due < today;
  const status = !open
    ? { label: "Completed", tone: "ok" as const }
    : late
      ? { label: "Overdue", tone: "err" as const }
      : f.due === today
        ? { label: "Due today", tone: "warn" as const }
        : { label: "Scheduled", tone: "info" as const };

  return (
    <div className="row !items-start">
      <Badge tone={status.tone}>{status.label}</Badge>
      <div className="min-w-0 flex-[1_1_220px]">
        <div className="font-medium">
          {f.type} ·{" "}
          <button type="button" className="linkb font-medium" onClick={onOpenClient}>
            {client?.name}
          </button>
        </div>
        <div className="mini">{f.note}</div>
        <div className="help">
          <span className="mono">{client?.caseId}</span> · {project ? project.id : "No case"}
          {showCsr ? ` · CSR ${userName(data, f.csr)}` : ""}
        </div>
        {f.outcome ? (
          <Callout tone="ok" className="mt-1.5">
            {f.outcome}
          </Callout>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className={cn("text-sm", late && "font-semibold text-danger-hover")}>{fmtDay(f.due)}</span>
        <span className="help">{open ? relDay(f.due) : `Completed ${ago(f.doneAt)}`}</span>
        {open ? (
          <Button size="sm" variant="primary" onClick={onComplete}>
            Complete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
