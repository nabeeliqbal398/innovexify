"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Callout, Card, CardHeader } from "@/components/ui/primitives";
import { COMP_STAGES, STAGES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { msDay } from "@/lib/dates";
import { CASE_STAGE } from "@/lib/api-mappers";
import { useMoveStageMutation } from "@/store/api/cases";
import type { Project } from "@/types/domain";
import { isDone } from "./case-data";
import { isRollback, needsFilingNumber } from "./case-rules";

const LOCK_NOTE = {
  CSR: "CSRs can follow progress but can't move formation stages.",
  COMPLIANCE:
    "Compliance moves document milestones (Documents Pending → Ready for Filing). Later stages are moved by Admin or Manager.",
} as const;

const STEP_BASE =
  "relative flex flex-[0_0_84px] min-[641px]:flex-[1_0_96px] flex-col items-center gap-[5px] px-1 text-center text-[11px] before:absolute before:left-[-50%] before:top-3 before:z-0 before:h-0.5 before:w-full before:bg-border before:content-[''] first:before:hidden";

/** Milestone stepper plus the stage move control for roles that may move stages. */
export function CaseStagePanel({ project }: { project: Project }) {
  const me = useMe();
  const run = useAction();
  const [move, { isLoading }] = useMoveStageMutation();
  const [draft, setDraft] = useState("");
  const [filingNo, setFilingNo] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const stage = STAGES[project.stageIdx];
  const done = isDone(project);
  const canStage = me.role === "ADMIN" || me.role === "MANAGER" || (me.role === "COMPLIANCE" && COMP_STAGES.includes(stage));
  const base: string[] = me.role === "COMPLIANCE" ? [...COMP_STAGES] : [...STAGES];
  const options = base.includes(stage) ? base : [stage, ...base];
  const target = draft || stage;
  const needFiling = needsFilingNumber(project, target);
  const rollback = isRollback(project, target);
  const blocked = target === stage || (needFiling && !filingNo.trim()) || (rollback && !reason.trim());
  const next = project.stageIdx < 10 ? STAGES[project.stageIdx + 1] : "Formation complete";
  const lockNote = me.role === "CSR" ? LOCK_NOTE.CSR : me.role === "COMPLIANCE" ? LOCK_NOTE.COMPLIANCE : "";

  const confirm = async () => {
    setError("");
    // The version is the one on the page right now; a stale one comes back as "this changed while you were editing".
    const outcome = await run(
      move({
        id: project.apiId,
        targetStage: CASE_STAGE.toKey(target),
        version: project.version,
        ...(needFiling ? { filingConfirmation: filingNo.trim() } : {}),
        ...(rollback ? { note: reason.trim() } : {}),
      }),
      { success: `Moved to ${target}`, quiet: true },
    );
    if (outcome.ok) {
      setDraft("");
      setFilingNo("");
      setReason("");
    } else if (outcome.error.errorCode !== "PERMISSION_DENIED" && outcome.error.errorCode !== "CONCURRENT_MODIFICATION") {
      setError(outcome.error.message);
    }
  };

  return (
    <Card>
      <CardHeader title="Milestones" aside={<span className="help">Next: {next}</span>} />
      <div className="card-b">
        <ol tabIndex={0} aria-label="Case milestones" className="m-0 flex list-none gap-0 overflow-x-auto px-0.5 pb-0.5 pt-1">
          {STAGES.slice(1).map((label, i) => {
            const idx = i + 1;
            const isDoneStep = project.stageIdx > idx || done;
            const isCurrent = project.stageIdx === idx && !done;
            const event = project.events.filter((e) => e.to === label).slice(-1)[0];
            const state = isDoneStep ? "Completed" : isCurrent ? "Current stage" : "Upcoming";
            return (
              <li
                key={label}
                aria-label={`${label}: ${state}`}
                className={`${STEP_BASE} ${
                  isDoneStep
                    ? "text-success before:bg-success/50"
                    : isCurrent
                      ? "font-semibold text-primary-soft-foreground before:bg-primary/50"
                      : "text-muted-foreground"
                }`}
              >
                <span
                  className={`relative z-[1] flex size-[26px] items-center justify-center rounded-full border-2 text-[11px] font-bold ${
                    isDoneStep
                      ? "border-success bg-success text-surface"
                      : isCurrent
                        ? "border-primary bg-surface text-primary-soft-foreground ring-4 ring-primary-soft"
                        : "border-border-strong bg-surface text-muted-foreground"
                  }`}
                >
                  {isDoneStep ? "✓" : idx}
                </span>
                <span>{label}</span>
                <span className="help text-[10px]">{event ? msDay(event.at) : ""}</span>
              </li>
            );
          })}
        </ol>
        {canStage ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Move to stage" className="flex-[1_1_180px]">
                {(id) => (
                  <Select id={id} value={target} onChange={(e) => setDraft(e.target.value)}>
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {needFiling ? (
                <Field label="State filing confirmation no." className="flex-[1_1_180px]">
                  {(id) => (
                    <Input id={id} className="mono" value={filingNo} placeholder="As issued by the state" onChange={(e) => setFilingNo(e.target.value)} />
                  )}
                </Field>
              ) : null}
              <Button variant="primary" disabled={blocked || isLoading} onClick={() => void confirm()}>
                {isLoading ? "Moving…" : "Confirm stage change"}
              </Button>
            </div>
            {rollback ? (
              <Field label="Reason for moving the case back" help="Required. It is recorded on the timeline as “Rolled back”. Only Admin and Manager can move a case back.">
                {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
              </Field>
            ) : null}
            {error ? (
              <span role="alert" className="errtxt">
                {error}
              </span>
            ) : null}
            <span className="help">The client sees the new stage immediately. Recording a state approval needs the state&apos;s own confirmation number.</span>
          </>
        ) : lockNote ? (
          <Callout tone="info" icon="eye">
            {lockNote}
          </Callout>
        ) : null}
      </div>
    </Card>
  );
}
