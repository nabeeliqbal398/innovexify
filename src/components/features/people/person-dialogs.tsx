"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ROLE_LABEL } from "@/constants/vocab";
import { emailSchema } from "@/lib/validators";
import { useAppDispatch, useData } from "@/hooks/useStore";
import { changeEmail, reassignCsr, removeUser } from "@/store/actions/people";
import { userName } from "@/store/selectors";

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
  /** Id of the person the dialog acts on, or null when closed. */
  userId: string | null;
  onClose: () => void;
}

const reassignSchema = z.object({
  csr: z.string().min(1, "Select a CSR."),
  reason: z.string().max(500, "Keep the reason under 500 characters."),
});
type ReassignValues = z.infer<typeof reassignSchema>;

/** Change a client's CSR. Only Admin and Manager reach this; the action checks again. */
export function ReassignDialog({ userId, onClose }: DialogProps) {
  const data = useData();
  const dispatch = useAppDispatch();
  const client = data.users.find((u) => u.id === userId);
  const csrs = data.users.filter((u) => u.role === "CSR" && u.status === "Active" && u.id !== client?.csr);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<ReassignValues>({ resolver: zodResolver(reassignSchema), defaultValues: { csr: "", reason: "" }, mode: "onChange" });

  useEffect(() => {
    if (userId) reset({ csr: "", reason: "" });
  }, [userId, reset]);

  const submit = handleSubmit((values) => {
    if (!client) return;
    const result = dispatch(reassignCsr(client.id, values.csr, values.reason));
    if (result.ok) onClose();
    else setError("csr", { message: result.error });
  });

  return (
    <Modal open={Boolean(client)} onOpenChange={(o) => !o && onClose()} title="Reassign CSR">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Summary
          rows={[
            ["Client", client?.name ?? ""],
            ["Case ID", client?.caseId ?? "", true],
            ["Current CSR", userName(data, client?.csr)],
          ]}
        />
        <Field label="New CSR" error={errors.csr?.message}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.csr)} {...register("csr")}>
              <option value="">Select CSR</option>
              {csrs.map((c) => (
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
          <Button type="submit" variant="primary" disabled={!isValid}>
            Reassign
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

const emailFormSchema = z.object({ email: emailSchema });
type EmailValues = z.infer<typeof emailFormSchema>;

/** Change a login email. The role and records stay the same. */
export function EmailDialog({ userId, onClose }: DialogProps) {
  const data = useData();
  const dispatch = useAppDispatch();
  const target = data.users.find((u) => u.id === userId);
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

  const submit = handleSubmit((values) => {
    if (!target) return;
    const result = dispatch(changeEmail(target.id, values.email));
    if (result.ok) onClose();
    else setError("email", { message: result.error });
  });

  return (
    <Modal open={Boolean(target)} onOpenChange={(o) => !o && onClose()} title="Change login email">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Summary
          rows={[
            ["Account", target?.name ?? ""],
            ["Role", target ? ROLE_LABEL[target.role] : ""],
            ["Current email", target?.email ?? ""],
          ]}
        />
        <Field
          label="New email"
          error={errors.email?.message}
          help="The role and records stay the same. Production sends a verification link to the new address and a notice to the old one."
        >
          {(id, describedBy) => <Input id={id} type="email" aria-describedby={describedBy} invalid={Boolean(errors.email)} {...register("email")} />}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Update email
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Remove an account from the portal. The person must type the account email to confirm. */
export function RemoveDialog({ userId, onClose }: DialogProps) {
  const data = useData();
  const dispatch = useAppDispatch();
  const target = data.users.find((u) => u.id === userId);
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
    if (userId) reset({ confirm: "" });
  }, [userId, reset]);

  const submit = handleSubmit(() => {
    if (!target) return;
    const result = dispatch(removeUser(target.id));
    if (result.ok) onClose();
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
          <Button type="submit" variant="danger" disabled={!isValid}>
            Remove user
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
