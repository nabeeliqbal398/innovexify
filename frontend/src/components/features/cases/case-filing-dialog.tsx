"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "@/lib/z";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { FILING_STATUSES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { FILING_STATUS } from "@/lib/api-mappers";
import type { CaseFiling } from "@/lib/mappers/case-side";
import { useSaveCaseFilingMutation } from "@/store/api/cases";
import type { Project } from "@/types/domain";

const FILING_TYPES = [
  "Articles of Organization",
  "Certificate of Formation",
  "Certificate of Incorporation",
  "EIN application (SS-4)",
  "Annual report",
  "Amendment",
] as const;

const needsDate = ["Submitted", "Pending state review", "Approved", "Rejected"];

const schema = z
  .object({
    type: z.string().min(1, "Choose a filing type."),
    status: z.enum(["Not submitted", "Submitted", "Pending state review", "Approved", "Rejected"]),
    submittedOn: z.string(),
    reference: z.string().max(64, "Keep the reference under 64 characters."),
    nextAction: z.string().max(200, "Keep the next action under 200 characters."),
    nextActionDate: z.string(),
    reason: z.string().max(300, "Keep the reason under 300 characters."),
  })
  .superRefine((v, ctx) => {
    if (needsDate.includes(v.status) && !v.submittedOn) {
      ctx.addIssue({ code: "custom", path: ["submittedOn"], message: "Enter the submission date." });
    }
    if (v.status === "Approved" && !v.reference.trim()) {
      ctx.addIssue({ code: "custom", path: ["reference"], message: "Approved filings need the reference number issued by the state." });
    }
  });
type Values = z.infer<typeof schema>;

/** Add or update a manual filing record on this case. `filing` is undefined when adding. */
export function CaseFilingDialog({ filing, project, onClose }: { filing?: CaseFiling; project: Project; onClose: () => void }) {
  const run = useAction();
  const [save, { isLoading }] = useSaveCaseFilingMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      type: filing?.type ?? "Articles of Organization",
      status: filing?.status ?? "Not submitted",
      submittedOn: filing?.submitted ?? "",
      reference: filing?.ref ?? "",
      nextAction: filing?.next ?? "",
      nextActionDate: filing?.nextDate ?? "",
      reason: "",
    },
  });

  const submit = handleSubmit(async (values) => {
    const body = {
      type: values.type,
      status: FILING_STATUS.toKey(values.status),
      submittedOn: values.submittedOn || undefined,
      reference: values.reference.trim(),
      nextAction: values.nextAction.trim(),
      nextActionDate: values.nextActionDate || undefined,
      ...(filing && values.reason.trim() ? { reason: values.reason.trim() } : {}),
    };
    const outcome = await run(save({ ...(filing ? { id: filing.id } : { caseId: project.apiId }), ...body }), {
      success: "Filing saved",
      setError,
      fields: ["type", "status", "submittedOn", "reference", "nextAction", "nextActionDate", "reason"],
    });
    if (outcome.ok) onClose();
  });

  return (
    <Modal
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={filing ? "Update filing" : "Add filing"}
      description={`${project.id} · ${project.clientName}. Manual record: nothing is sent to or read from any state system.`}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <Field label="Filing type" error={errors.type?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.type)} {...register("type")}>
                {FILING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Status" error={errors.status?.message}>
            {(id) => (
              <Select id={id} {...register("status")}>
                {FILING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Submission date" error={errors.submittedOn?.message}>
            {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.submittedOn)} {...register("submittedOn")} />}
          </Field>
          <Field label="Reference number" error={errors.reference?.message}>
            {(id, describedBy) => (
              <Input id={id} className="mono" placeholder="As issued by the state" aria-describedby={describedBy} invalid={Boolean(errors.reference)} {...register("reference")} />
            )}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Next action" error={errors.nextAction?.message}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.nextAction)} {...register("nextAction")} />}
          </Field>
          <Field label="Next action date" error={errors.nextActionDate?.message}>
            {(id) => <Input id={id} type="date" {...register("nextActionDate")} />}
          </Field>
        </FieldRow>
        {filing ? (
          <Field label="Reason (only when moving a filing back)" help="Admin and Manager can move a filing back with a reason; it goes in the audit log." error={errors.reason?.message}>
            {(id) => <Input id={id} {...register("reason")} />}
          </Field>
        ) : null}
        {errors.root?.message ? (
          <Callout tone="warn" icon="alert" role="alert">
            {errors.root.message}
          </Callout>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
            {isLoading ? "Saving…" : "Save filing"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
