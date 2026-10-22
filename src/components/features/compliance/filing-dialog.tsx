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
import { can } from "@/lib/permissions";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { saveFiling } from "@/store/actions/cases";
import { userName } from "@/store/selectors";
import type { FilingStatus } from "@/types/domain";

const FILING_TYPES = [
  "Articles of Organization",
  "Certificate of Formation",
  "Certificate of Incorporation",
  "EIN application (SS-4)",
  "Annual report",
  "Amendment",
];
const NEEDS_DATE: FilingStatus[] = ["Submitted", "Pending state review", "Approved", "Rejected"];

const schema = z
  .object({
    project: z.string().min(1, "Choose the case this filing belongs to."),
    type: z.string().min(1),
    status: z.enum(FILING_STATUSES as [FilingStatus, ...FilingStatus[]]),
    submitted: z.string(),
    ref: z.string(),
    next: z.string(),
    nextDate: z.string(),
  })
  .superRefine((v, ctx) => {
    if (NEEDS_DATE.includes(v.status) && !v.submitted) ctx.addIssue({ code: "custom", path: ["submitted"], message: "Enter the submission date." });
    if (v.status === "Approved" && !v.ref.trim()) {
      ctx.addIssue({ code: "custom", path: ["ref"], message: "Approved filings need the reference number issued by the state." });
    }
  });
type FormValues = z.infer<typeof schema>;

interface FilingDialogProps {
  /** `null` is closed, an empty string adds a filing, anything else edits that filing. */
  filingId: string | null;
  onClose: () => void;
}

function FilingForm({ filingId, onClose }: { filingId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useData();
  const me = useMe();
  const [formError, setFormError] = useState("");
  const existing = data.filings.find((f) => f.id === filingId);
  const cases = data.projects.filter((p) => {
    const c = data.users.find((u) => u.id === p.client);
    return c && c.status !== "Removed" && can(me, "viewClient", c);
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: existing
      ? {
          project: existing.project,
          type: existing.type,
          status: existing.status,
          submitted: existing.submitted,
          ref: existing.ref,
          next: existing.next,
          nextDate: existing.nextDate,
        }
      : { project: "", type: FILING_TYPES[0], status: "Not submitted", submitted: "", ref: "", next: "", nextDate: "" },
  });

  const submit = handleSubmit((values) => {
    const result = dispatch(saveFiling(filingId, values));
    if (result.ok) onClose();
    else if (result.error && result.error !== "Not allowed.") setFormError(result.error);
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
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
        <Field label="Filing type">
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
            <Input id={id} className="mono" aria-describedby={describedBy} invalid={Boolean(errors.ref)} placeholder="As issued by the state" {...register("ref")} />
          )}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Next action">
          {(id) => <Input id={id} {...register("next")} />}
        </Field>
        <Field label="Next action date">
          {(id) => <Input id={id} type="date" {...register("nextDate")} />}
        </Field>
      </FieldRow>
      {formError ? (
        <Callout tone="warn" role="alert">
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
  );
}

/** Add or update a filing record. Entirely manual: nothing is sent to a state system. */
export function FilingDialog({ filingId, onClose }: FilingDialogProps) {
  return (
    <Modal
      open={filingId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={filingId ? "Update filing" : "Add filing"}
      description="Manual record. Nothing is sent to or read from any state system."
      wide
    >
      {filingId === null ? null : <FilingForm filingId={filingId} onClose={onClose} />}
    </Modal>
  );
}
