"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { Chip } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { can, type Permission } from "@/lib/permissions";
import { flash } from "@/lib/toast";
import { useDirectoryQuery, useInviteClientMutation, useInviteUserMutation } from "@/store/api/people";
import type { Role } from "@/types/domain";

const INVITABLE: Role[] = ["MANAGER", "CSR", "COMPLIANCE", "CLIENT"];

const inviteSchema = z.object({
  name: z.string().max(80, "Keep the name under 80 characters."),
  email: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Enter a valid email address."),
  csr: z.string(),
  note: z.string().max(500, "Keep the note under 500 characters."),
});
type InviteValues = z.infer<typeof inviteSchema>;

export function InviteForm() {
  const me = useMe();
  const run = useAction();
  const roleLabelId = useId();
  const choices = INVITABLE.filter((r) => can(me, `invite${r}` as Permission));
  const requested = useSearchParams().get("invite");
  const [picked, setPicked] = useState<Role>(choices.find((r) => r === requested) ?? choices[choices.length - 1] ?? "CLIENT");
  const role = choices.includes(picked) ? picked : (choices[choices.length - 1] ?? "CLIENT");
  const isClient = role === "CLIENT";
  const isCsr = me.role === "CSR";
  const [formError, setFormError] = useState("");
  const [inviteUser, userState] = useInviteUserMutation();
  const [inviteClient, clientState] = useInviteClientMutation();

  const csrs = useDirectoryQuery({ role: "CSR" }, { skip: !isClient });
  const csrOptions = [
    isCsr ? { id: "me", label: `Assign to me (${me.name})` } : { id: "none", label: "Leave unassigned for now" },
    ...(csrs.data ?? []).filter((u) => !isCsr || u.id !== me.id).map((c) => ({ id: c.id, label: c.name })),
  ];

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: "", email: "", csr: isCsr ? "me" : "none", note: "" },
  });
  const busy = userState.isLoading || clientState.isLoading;

  const submit = handleSubmit(async (values) => {
    setFormError("");
    const fields = ["email", "name", "note", "csrId"];
    const clear = () => reset({ name: "", email: "", csr: isCsr ? "me" : "none", note: "" });
    if (isClient) {
      const outcome = await run(
        inviteClient({
          email: values.email,
          name: values.name.trim() || undefined,
          csrId: values.csr === "none" ? undefined : values.csr,
          note: values.note.trim() || undefined,
        }),
        { setError: (name, e) => setError(name === ("csrId" as never) ? "csr" : (name as keyof InviteValues), e), fields, quiet: true },
      );
      if (outcome.ok) {
        const sent = outcome.data.invitationEmail;
        if (sent === "sent") flash(`Client invitation sent to ${outcome.data.email}`);
        else if (sent === "switched-off") flash(`Client created. The invitation email is switched off in Notifications & automation, so nothing was sent to ${outcome.data.email}.`);
        else toast.warning(`Client created, but the invitation email could not be sent. Use "Resend invitation" below.`);
        clear();
      } else reportInline(outcome.error, setFormError);
      return;
    }
    const outcome = await run(inviteUser({ email: values.email, role, name: values.name.trim() || undefined, note: values.note.trim() || undefined }), {
      setError,
      fields,
      quiet: true,
      success: `${ROLE_LABEL[role]} invitation sent to ${values.email}`,
    });
    if (outcome.ok) clear();
    else reportInline(outcome.error, setFormError);
  });

  return (
    <section id="sec-inv" aria-labelledby="inv-h" className="card flex scroll-mt-4 flex-col gap-3 p-4">
      <span id="inv-h" className="h3">
        New invitation
      </span>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-[5px]">
          <span id={roleLabelId} className="flabel">
            Role
          </span>
          <div role="radiogroup" aria-labelledby={roleLabelId} className="flex flex-wrap gap-1.5">
            {choices.map((r) => (
              <Chip
                key={r}
                active={r === role}
                role="radio"
                aria-checked={r === role}
                aria-pressed={undefined}
                onClick={() => {
                  setPicked(r);
                  setFormError("");
                }}
              >
                {ROLE_LABEL[r]}
              </Chip>
            ))}
          </div>
          <span className="help">{isCsr ? "Client is the only role CSRs can invite." : "Only roles you are allowed to invite are listed."}</span>
        </div>
        <FieldRow>
          <Field label="Full name" error={errors.name?.message}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.name)} placeholder="If known" {...register("name")} />}
          </Field>
          <Field label="Email" error={errors.email?.message}>
            {(id, describedBy) => (
              <Input id={id} type="email" aria-describedby={describedBy} invalid={Boolean(errors.email)} placeholder="name@company.com" {...register("email")} />
            )}
          </Field>
        </FieldRow>
        {isClient ? (
          <FieldRow>
            <div className="flex flex-col gap-[5px]">
              <span className="flabel">Case ID</span>
              <div className="mono flex h-[34px] items-center rounded-md border border-border-strong bg-background px-2.5 text-muted-foreground">Assigned when you send</div>
              <span className="help">The next free case ID and the first case are created with the client.</span>
            </div>
            <Field label="Assigned CSR" error={errors.csr?.message}>
              {(id, describedBy) => (
                <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.csr)} {...register("csr")}>
                  {csrOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </FieldRow>
        ) : null}
        <Field
          label={
            <>
              Personal note <span className="font-normal text-muted-foreground">(optional, included in the invitation email)</span>
            </>
          }
          error={errors.note?.message}
        >
          {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} invalid={Boolean(errors.note)} {...register("note")} />}
        </Field>
        {formError ? (
          <span role="alert" className="errtxt">
            {formError}
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** A failure the form shows next to its button (a field error is already on its input). */
function reportInline(error: { message: string; errorCode: string; fieldErrors: unknown[] }, set: (m: string) => void): void {
  if (error.errorCode === "PERMISSION_DENIED") return; // the dialog already explained it
  if (error.fieldErrors.length === 0) set(error.message);
}
