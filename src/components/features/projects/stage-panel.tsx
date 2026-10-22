"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { COMP_STAGES, STAGES } from "@/constants/vocab";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { moveStage, needsFilingNumber } from "@/store/actions/cases";
import type { Project } from "@/types/domain";

interface StageValues {
  stage: string;
  filing: string;
}

/** Stage move for one project. Compliance only moves document milestones; CSRs see progress read-only. */
export function StagePanel({ project }: { project: Project }) {
  const me = useMe();
  const dispatch = useAppDispatch();
  const current = STAGES[project.stageIdx];
  const canStage = me.role === "ADMIN" || me.role === "MANAGER" || (me.role === "COMPLIANCE" && COMP_STAGES.includes(current));

  const options = useMemo<string[]>(() => {
    const base: string[] = me.role === "COMPLIANCE" ? [...COMP_STAGES] : [...STAGES];
    return base.includes(current) ? base : [current, ...base];
  }, [me.role, current]);

  const schema = useMemo(
    () =>
      z
        .object({ stage: z.string(), filing: z.string() })
        .superRefine((v, ctx) => {
          if (v.stage === current) ctx.addIssue({ code: "custom", path: ["stage"], message: "Choose a different stage." });
          if (needsFilingNumber(project, v.stage) && !v.filing.trim()) {
            ctx.addIssue({ code: "custom", path: ["filing"], message: "Enter the state's confirmation number." });
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
  } = useForm<StageValues>({ resolver: zodResolver(schema), defaultValues: { stage: current, filing: "" }, mode: "onChange" });

  useEffect(() => {
    reset({ stage: current, filing: "" });
  }, [current, reset]);

  const needFiling = needsFilingNumber(project, watch("stage"));

  const submit = handleSubmit((values) => {
    const result = dispatch(moveStage(project.id, values.stage, values.filing));
    if (!result.ok && result.error) setError(/confirmation/i.test(result.error) ? "filing" : "stage", { message: result.error });
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
              <Input
                id={id}
                className="mono"
                aria-describedby={describedBy}
                invalid={Boolean(errors.filing)}
                placeholder="As issued by the state"
                {...register("filing")}
              />
            )}
          </Field>
        ) : null}
        <Button type="submit" variant="primary" className="!min-w-0 !flex-none" disabled={!isValid}>
          Confirm stage change
        </Button>
      </FieldRow>
      <span className="help">
        {needFiling ? "A state approval can only be recorded from the state's own confirmation number." : "The client sees the new stage and progress immediately."}
      </span>
    </form>
  );
}
