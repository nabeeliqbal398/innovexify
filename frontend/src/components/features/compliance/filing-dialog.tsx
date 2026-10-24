"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "@/lib/z";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { FILING_STATUSES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { FILING_STATUS } from "@/lib/api-mappers";
import { useCaseOptionsQuery, useCreateFilingMutation, useUpdateFilingMutation } from "@/store/api/filings";
import type { Filing, FilingStatus } from "@/types/domain";

const FILING_TYPES = [
  "Articles of Organization",
  "Certificate of Formation",
  "Certificate of Incorporation",
  "EIN application (SS-4)",
  "Annual report",
  "Amendment",
];
const NEEDS_DATE: FilingStatus[] = ["Submitted", "Pending state review", "Approved", "Rejected"];

// The same rules the server enforces, so the obvious slips are caught before sending. The server still decides.
const schema = z
  .object({
    caseId: z.string().min(1, "Choose the case this filing belongs to."),
    type: z.string().min(1, "Enter the filing type."),
    status: z.enum(FILING_STATUSES as [FilingStatus, ...FilingStatus[]]),
    submitted: z.string(),
    ref: z.string(),
    next: z.string(),
    nextDate: z.string(),
    reason: z.string(),
  })
  .superRefine((v, ctx) => {
    if (NEEDS_DATE.includes(v.status) && !v.submitted) ctx.addIssue({ code: "custom", path: ["submitted"], message: "Enter the submission date." });
    if (v.status === "Approved" && !v.ref.trim()) {
      ctx.addIssue({ code: "custom", path: ["ref"], message: "Approved filings need the reference number issued by the state." });
    }
  });
type FormValues = z.infer<typeof schema>;

export type FilingTarget = Filing | "new" | null;

interface FilingDialogProps {
  /** `null` is closed, `"new"` adds a filing, a filing edits it. */
  target: FilingTarget;
  /** Fixes the case when adding from a case page. */
  caseId?: string;
  caseLabel?: string;
  onClose: () => void;
}

const FIELD_OF: Record<string, keyof FormValues> = { caseId: "caseId", type: "type", status: "status", submittedOn: "submitted", reference: "ref", nextAction: "next", nextActionDate: "nextDate", reason: "reason" };

function FilingForm({ target, caseId, caseLabel, onClose }: { target: Filing | "new"; caseId?: string; caseLabel?: string; onClose: () => void }) {
  const run = useAction();
  const existing = target === "new" ? undefined : target;
  const [formError, setFormError] = useState("");
  const [create, creating] = useCreateFilingMutation();
  const [update, updating] = useUpdateFilingMutation();
  const cases = useCaseOptionsQuery(undefined, { skip: Boolean(existing || caseId) });

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: existing
      ? { caseId: existing.caseId, type: existing.type, status: existing.status, submitted: existing.submitted, ref: existing.ref, next: existing.next, nextDate: existing.nextDate, reason: "" }
      : { caseId: caseId ?? "", type: FILING_TYPES[0] as string, status: "Not submitted", submitted: "", ref: "", next: "", nextDate: "", reason: "" },
  });
  const status = watch("status");
  const movingBack = Boolean(existing) && FILING_STATUSES.indexOf(status) < FILING_STATUSES.indexOf(existing?.status ?? "Not submitted");
  const busy = creating.isLoading || updating.isLoading;

  const submit = handleSubmit(async (v) => {
    setFormError("");
    const common = { type: v.type, status: FILING_STATUS.toKey(v.status), reference: v.ref.trim(), nextAction: v.next.trim() };
    const outcome = existing
      ? await run(
          update({ id: existing.id, ...common, submittedOn: v.submitted || null, nextActionDate: v.nextDate || null, ...(v.reason.trim() ? { reason: v.reason.trim() } : {}) }),
          { success: "Filing tracker updated (manual record, no state system contacted).", quiet: true },
        )
      : await run(
          create({ caseId: v.caseId, ...common, ...(v.submitted ? { submittedOn: v.submitted } : {}), ...(v.nextDate ? { nextActionDate: v.nextDate } : {}) }),
          { success: "Filing recorded (manual record, no state system was contacted).", quiet: true },
        );
    if (outcome.ok) return onClose();
    const e = outcome.error;
    if (e.errorCode === "PERMISSION_DENIED" || e.errorCode === "CONCURRENT_MODIFICATION") return;
    let placed = false;
    for (const fe of e.fieldErrors) {
      const field = FIELD_OF[fe.field];
      if (field) {
        setError(field, { message: fe.message });
        placed = true;
      }
    }
    if (!placed) setFormError(e.message);
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
      <FieldRow>
        <Field label="Case" error={errors.caseId?.message}>
          {(id, describedBy) =>
            existing || caseId ? (
              <Input id={id} readOnly value={existing ? `${existing.project} · ${existing.clientName}` : (caseLabel ?? caseId)} />
            ) : (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.caseId)} {...register("caseId")}>
                <option value="">{cases.isLoading ? "Loading cases…" : "Select a case"}</option>
                {(cases.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display} · {p.clientName}
                  </option>
                ))}
              </Select>
            )
          }
        </Field>
        <Field label="Filing type" error={errors.type?.message}>
          {(id) => (
            <Select id={id} {...register("type")}>
              {FILING_TYPES.concat(existing && !FILING_TYPES.includes(existing.type) ? [existing.type] : []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </FieldRow>
      <FieldRow>
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
        <Field label="Submission date" error={errors.submitted?.message}>
          {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.submitted)} {...register("submitted")} />}
        </Field>
        <Field label="Reference number" error={errors.ref?.message}>
          {(id, describedBy) => (
            <Input id={id} className="mono" aria-describedby={describedBy} invalid={Boolean(errors.ref)} placeholder="As issued by the state" {...register("ref")} />
          )}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Next action" error={errors.next?.message}>
          {(id) => <Input id={id} {...register("next")} />}
        </Field>
        <Field label="Next action date" error={errors.nextDate?.message}>
          {(id) => <Input id={id} type="date" {...register("nextDate")} />}
        </Field>
      </FieldRow>
      {movingBack ? (
        <Field label="Why is this being moved back?" error={errors.reason?.message} help="Admin and Manager can move a filing back with a reason. It is kept in the audit log.">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.reason)} {...register("reason")} />}
        </Field>
      ) : null}
      {formError ? (
        <Callout tone="warn" role="alert">
          {formError}
        </Callout>
      ) : null}
      <ModalFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!isValid || busy}>
          {busy ? "Saving…" : "Save filing"}
        </Button>
      </ModalFooter>
    </form>
  );
}

/** Add or update a filing record. Entirely manual: nothing is sent to a state system. */
export function FilingDialog({ target, caseId, caseLabel, onClose }: FilingDialogProps) {
  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={target && target !== "new" ? "Update filing" : "Add filing"}
      description="Manual record. Nothing is sent to or read from any state system."
      wide
    >
      {target === null ? null : <FilingForm key={target === "new" ? "new" : target.id} target={target} caseId={caseId} caseLabel={caseLabel} onClose={onClose} />}
    </Modal>
  );
}
