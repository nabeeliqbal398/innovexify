"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { Chip } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { can, type Permission } from "@/lib/permissions";
import { inviteUser } from "@/store/actions/people";
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
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const roleLabelId = useId();
  const choices = INVITABLE.filter((r) => can(me, `invite${r}` as Permission));
  const requested = useSearchParams().get("invite");
  const [picked, setPicked] = useState<Role>(
    choices.find((r) => r === requested) ?? choices[choices.length - 1] ?? "CLIENT",
  );
  const role = choices.includes(picked) ? picked : (choices[choices.length - 1] ?? "CLIENT");
  const isClient = role === "CLIENT";
  const isCsr = me.role === "CSR";
  const [formError, setFormError] = useState("");

  const activeClients = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed");
  const csrOptions = [
    isCsr ? { id: "me", label: `Assign to me (${me.name})` } : { id: "none", label: "Leave unassigned for now" },
    ...data.users
      .filter((u) => u.role === "CSR" && u.status === "Active" && (!isCsr || u.id !== me.id))
      .map((c) => ({ id: c.id, label: `${c.name} · ${activeClients.filter((x) => x.csr === c.id).length} clients` })),
  ];

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: "", email: "", csr: csrOptions[0].id, note: "" },
  });

  const nextCase = `${data.company.casePrefix}-2026-${String(data.counters.nextCase).padStart(4, "0")}`;

  const submit = handleSubmit((values) => {
    setFormError("");
    const result = dispatch(inviteUser({ role, name: values.name, email: values.email, csr: values.csr, note: values.note }));
    if (result.ok) {
      reset({ name: "", email: "", csr: csrOptions[0].id, note: "" });
      return;
    }
    const message = result.error ?? "You can't send this invitation.";
    if (/email/i.test(message)) setError("email", { message });
    else if (/CSR/.test(message)) setError("csr", { message });
    else setFormError(message);
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
          <span className="help">{isCsr ? "Client is the only role CSRs can invite." : "Only roles you're allowed to invite are listed."}</span>
        </div>
        <FieldRow>
          <Field label="Full name" error={errors.name?.message}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.name)} placeholder="If known" {...register("name")} />}
          </Field>
          <Field label="Email" error={errors.email?.message}>
            {(id, describedBy) => (
              <Input
                id={id}
                type="email"
                aria-describedby={describedBy}
                invalid={Boolean(errors.email)}
                placeholder="name@company.com"
                {...register("email")}
              />
            )}
          </Field>
        </FieldRow>
        {isClient ? (
          <FieldRow>
            <div className="flex flex-col gap-[5px]">
              <span className="flabel">Case ID</span>
              <div className="mono flex h-[34px] items-center rounded-md border border-border-strong bg-background px-2.5">{nextCase}</div>
              <span className="help">Demo counter. The server assigns and guarantees unique IDs in production.</span>
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
              Internal note <span className="font-normal text-muted-foreground">(optional, never shown to the invitee)</span>
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
          <span className="help flex-1">Email delivery is simulated.</span>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            Send invitation
          </Button>
        </div>
      </form>
    </section>
  );
}
