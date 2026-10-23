"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { isRollback, needsFilingNumber } from "@/components/features/cases/case-rules";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { COMP_STAGES, STAGES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { CASE_STAGE } from "@/lib/api-mappers";
import { useMoveStageMutation } from "@/store/api/cases";
import type { Project } from "@/types/domain";

interface StageValues {
  stage: string;
  filing: string;
  reason: string;
}

/** Stage move for one project. Compliance only moves document milestones; CSRs see progress read-only. */
export function StagePanel({ project }: { project: Project }) {
  const me = useMe();
  const run = useAction();
  const [move, { isLoading }] = useMoveStageMutation();
  const current = STAGES[project.stageIdx];
  const canStage = me.role === "ADMIN" || me.role === "MANAGER" || (me.role === "COMPLIANCE" && COMP_STAGES.includes(current));

  const options = useMemo<string[]>(() => {
    const base: string[] = me.role === "COMPLIANCE" ? [...COMP_STAGES] : [...STAGES];
    return base.includes(current) ? base : [current, ...base];
  }, [me.role, current]);

  const schema = useMemo(
    () =>
      z
        .object({ stage: z.string(), filing: z.string(), reason: z.string() })
        .superRefine((v, ctx) => {
          if (v.stage === current) ctx.addIssue({ code: "custom", path: ["stage"], message: "Choose a different stage." });
          if (needsFilingNumber(project, v.stage) && !v.filing.trim()) {
            ctx.addIssue({ code: "custom", path: ["filing"], message: "Enter the state's confirmation number." });
          }
          if (isRollback(project, v.stage) && !v.reason.trim()) {
            ctx.addIssue({ code: "custom", path: ["reason"], message: "Say why the case is moving back." });
          }
        }),
    [project, current],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isValid },
  } = useForm<StageValues>({ resolver: zodResolver(schema), defaultValues: { stage: current, filing: "", reason: "" }, mode: "onChange" });

  useEffect(() => {
    reset({ stage: current, filing: "", reason: "" });
  }, [current, reset]);

  const chosen = watch("stage");
  const needFiling = needsFilingNumber(project, chosen);
  const rollback = isRollback(project, chosen);

  const submit = handleSubmit(async (values) => {
    await run(
      move({
        id: project.apiId,
        targetStage: CASE_STAGE.toKey(values.stage),
        version: project.version,
        ...(needFiling ? { filingConfirmation: values.filing.trim() } : {}),
        ...(rollback ? { note: values.reason.trim() } : {}),
      }),
      {
        success: `Moved to ${values.stage}`,
        setError: ((name: string, e: { message?: string }) => setError(name === "filingConfirmation" ? "filing" : name === "targetStage" ? "stage" : name === "note" ? "reason" : "stage", { message: e.message })) as never,
        fields: ["filingConfirmation", "targetStage", "note"],
      },
    );
  });

  if (!canStage) {
    return (
      <Callout tone="info" icon="eye">
        {me.role === "CSR"
          ? "CSRs can see progress but not move formation stages."
          : "This stage is handled by Admin or Manager. Compliance moves the document milestones only."}
      </Callout>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <FieldRow>
        <Field label="Move to stage" error={errors.stage?.message}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.stage)} {...register("stage")}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {needFiling ? (
          <Field label="State filing confirmation no." error={errors.filing?.message}>
            {(id, describedBy) => (
              <Input id={id} className="mono" aria-describedby={describedBy} invalid={Boolean(errors.filing)} placeholder="As issued by the state" {...register("filing")} />
            )}
          </Field>
        ) : null}
        {rollback ? (
          <Field label="Reason for moving back" error={errors.reason?.message}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.reason)} {...register("reason")} />}
          </Field>
        ) : null}
        <Button type="submit" variant="primary" className="!min-w-0 !flex-none" disabled={!isValid || isLoading}>
          {isLoading ? "Moving…" : "Confirm stage change"}
        </Button>
      </FieldRow>
      <span className="help">
        {needFiling ? "A state approval can only be recorded from the state's own confirmation number." : "The client sees the new stage and progress immediately."}
      </span>
    </form>
  );
}
