"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ROLE_LABEL } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { emailSchema } from "@/lib/validators";
import { useChangeCsrMutation, useChangeEmailMutation, useDirectoryQuery, useRemoveUserMutation } from "@/store/api/people";
import type { User } from "@/types/domain";

function Summary({ rows }: { rows: ReadonlyArray<readonly [string, string, boolean?]> }) {
  return (
    <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map(([label, value, mono]) => (
        <div key={label} className="contents">
          <dt className="help">{label}</dt>
          <dd className={`m-0 ${mono ? "mono" : "font-medium"}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface DialogProps {
  /** The person the dialog acts on, or null when closed. */
  user: User | null;
  onClose: () => void;
}

const reassignSchema = z.object({
  csr: z.string().min(1, "Select a CSR."),
  reason: z.string().max(500, "Keep the reason under 500 characters."),
});
type ReassignValues = z.infer<typeof reassignSchema>;

/** Change a client's CSR. The server checks who may do this. */
export function ReassignDialog({ user: client, onClose }: DialogProps) {
  const run = useAction();
  const csrs = useDirectoryQuery({ role: "CSR" }, { skip: !client });
  const [changeCsr, { isLoading }] = useChangeCsrMutation();
  const options = (csrs.data ?? []).filter((c) => c.id !== client?.csr);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<ReassignValues>({ resolver: zodResolver(reassignSchema), defaultValues: { csr: "", reason: "" }, mode: "onChange" });

  useEffect(() => {
    if (client) reset({ csr: "", reason: "" });
  }, [client, reset]);

  const submit = handleSubmit(async (values) => {
    if (!client) return;
    const target = options.find((c) => c.id === values.csr);
    const outcome = await run(changeCsr({ id: client.id, csrId: values.csr, reason: values.reason.trim() || undefined }), {
      success: `${client.name} now assigned to ${target?.name ?? "the new CSR"}`,
    });
    if (outcome.ok) onClose();
    else if (outcome.error.errorCode === "VALIDATION_FAILED") setError("csr", { message: outcome.error.fieldErrors[0]?.message ?? outcome.error.message });
  });

  return (
    <Modal open={Boolean(client)} onOpenChange={(o) => !o && onClose()} title="Reassign CSR">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Summary rows={[["Client", client?.name ?? ""], ["Case ID", client?.caseId ?? "", true], ["Current CSR", client?.csrName ?? "Unassigned"]]} />
        <Field label="New CSR" error={errors.csr?.message}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.csr)} {...register("csr")}>
              <option value="">{csrs.isLoading ? "Loading…" : "Select CSR"}</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reason (optional)" error={errors.reason?.message}>
          {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} invalid={Boolean(errors.reason)} {...register("reason")} />}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
            {isLoading ? "Reassigning…" : "Reassign"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

const emailFormSchema = z.object({ email: emailSchema });
type EmailValues = z.infer<typeof emailFormSchema>;

/** Change a login email. The role and records stay the same. */
export function EmailDialog({ user: target, onClose }: DialogProps) {
  const run = useAction();
  const [changeEmail, { isLoading }] = useChangeEmailMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EmailValues>({ resolver: zodResolver(emailFormSchema), defaultValues: { email: "" } });

  useEffect(() => {
    if (target) reset({ email: target.email });
  }, [target, reset]);

  const submit = handleSubmit(async (values) => {
    if (!target) return;
    const outcome = await run(changeEmail({ id: target.id, email: values.email }), {
      success: "Email updated. The old address was told about the change.",
      setError,
      fields: ["email"],
      quiet: true,
    });
    if (outcome.ok) onClose();
    else if (outcome.error.fieldErrors.length === 0 && outcome.error.errorCode !== "PERMISSION_DENIED") setError("email", { message: outcome.error.message });
  });

  return (
    <Modal open={Boolean(target)} onOpenChange={(o) => !o && onClose()} title="Change login email">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Summary rows={[["Account", target?.name ?? ""], ["Role", target ? ROLE_LABEL[target.role] : ""], ["Current email", target?.email ?? ""]]} />
        <Field
          label="New email"
          error={errors.email?.message}
          help="The role and records stay the same. A notice goes to the old address, and someone still invited gets a new invitation at the new one."
        >
          {(id, describedBy) => <Input id={id} type="email" aria-describedby={describedBy} invalid={Boolean(errors.email)} {...register("email")} />}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isLoading}>
            {isLoading ? "Updating…" : "Update email"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Remove an account from the portal. The person must type the account email to confirm. */
export function RemoveDialog({ user: target, onClose }: DialogProps) {
  const run = useAction();
  const [removeUser, { isLoading }] = useRemoveUserMutation();
  const confirmText = target?.email ?? "";
  const schema = z.object({
    confirm: z.string().refine((v) => v.trim().toLowerCase() === confirmText.toLowerCase(), "Type the email exactly to confirm."),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<{ confirm: string }>({ resolver: zodResolver(schema), defaultValues: { confirm: "" }, mode: "onChange" });

  useEffect(() => {
    if (target) reset({ confirm: "" });
  }, [target, reset]);

  const submit = handleSubmit(async () => {
    if (!target) return;
    const outcome = await run(removeUser(target.id), { success: `${target.name} removed from the portal` });
    if (outcome.ok) onClose();
  });

  return (
    <Modal open={Boolean(target)} onOpenChange={(o) => !o && onClose()} title={`Remove ${target?.name ?? ""} from the portal?`}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <p className="text-neutral">
          Their account is closed and they can no longer sign in. Formation records, documents and the audit trail are kept for
          compliance. This can&apos;t be undone from the portal.
        </p>
        <Field
          label={
            <>
              Type <span className="mono">{confirmText}</span> to confirm
            </>
          }
          error={errors.confirm?.message}
        >
          {(id, describedBy) => <Input id={id} className="mono" aria-describedby={describedBy} {...register("confirm")} />}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={!isValid || isLoading}>
            {isLoading ? "Removing…" : "Remove user"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
