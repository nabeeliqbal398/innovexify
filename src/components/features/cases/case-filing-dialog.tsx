"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { FILING_STATUSES } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { saveFiling } from "@/store/actions/cases";
import { userName } from "@/store/selectors";
import { scopedProjects } from "./case-data";

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
    project: z.string().min(1, "Choose the case this filing belongs to."),
    type: z.string().min(1, "Choose a filing type."),
    status: z.enum(["Not submitted", "Submitted", "Pending state review", "Approved", "Rejected"]),
    submitted: z.string(),
    ref: z.string().max(80, "Keep the reference under 80 characters."),
    next: z.string().max(160, "Keep the next action under 160 characters."),
    nextDate: z.string(),
  })
  .superRefine((v, ctx) => {
    if (needsDate.includes(v.status) && !v.submitted) {
      ctx.addIssue({ code: "custom", path: ["submitted"], message: "Enter the submission date." });
    }
    if (v.status === "Approved" && !v.ref.trim()) {
      ctx.addIssue({ code: "custom", path: ["ref"], message: "Approved filings need the reference number issued by the state." });
    }
  });
type Values = z.infer<typeof schema>;

/** Add or update a manual filing record. `filingId` is empty when adding. */
export function CaseFilingDialog({ filingId, projectId, onClose }: { filingId: string; projectId: string; onClose: () => void }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState("");
  const filing = data.filings.find((f) => f.id === filingId);
  const cases = scopedProjects(data, me);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      project: filing?.project ?? projectId,
      type: filing?.type ?? "Articles of Organization",
      status: filing?.status ?? "Not submitted",
      submitted: filing?.submitted ?? "",
      ref: filing?.ref ?? "",
      next: filing?.next ?? "",
      nextDate: filing?.nextDate ?? "",
    },
  });

  const submit = handleSubmit((values) => {
    const result = dispatch(saveFiling(filingId, values));
    if (result.ok) onClose();
    else setFormError(result.error ?? "Could not save the filing.");
  });

  return (
    <Modal
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={filingId ? "Update filing" : "Add filing"}
      description="Manual record. Nothing is sent to or read from any state system."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <Field label="Case" error={errors.project?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.project)} {...register("project")}>
                <option value="">Select a case</option>
                {cases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {userName(data, p.client)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
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
        </FieldRow>
        <FieldRow>
          <Field label="Status">
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
          <Field label="Submission date" error={errors.submitted?.message}>
            {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.submitted)} {...register("submitted")} />}
          </Field>
          <Field label="Reference number" error={errors.ref?.message}>
            {(id, describedBy) => (
              <Input id={id} className="mono" placeholder="As issued by the state" aria-describedby={describedBy} invalid={Boolean(errors.ref)} {...register("ref")} />
            )}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Next action" error={errors.next?.message}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.next)} {...register("next")} />}
          </Field>
          <Field label="Next action date">{(id) => <Input id={id} type="date" {...register("nextDate")} />}</Field>
        </FieldRow>
        {formError ? (
          <Callout tone="warn" icon="alert" role="alert">
            {formError}
          </Callout>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
            Save filing
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
