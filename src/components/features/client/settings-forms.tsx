"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { Callout, Card, CardHeader } from "@/components/ui/primitives";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { changePassword, saveClientContact, saveClientProfile } from "@/store/actions/people";
import { flash } from "@/store/actions/core";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your full name."),
  preferred: z.string(),
});
type ProfileValues = z.infer<typeof profileSchema>;

const contactSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine((v) => !v || /^[+()\d\s-]{7,20}$/.test(v), "Enter a phone number using digits, spaces, +, - or brackets."),
  contactPref: z.string(),
  address: z.string(),
});
type ContactValues = z.infer<typeof contactSchema>;

const passwordSchema = z
  .object({
    cur: z.string().min(1, "Enter your current password."),
    nw: z
      .string()
      .refine((v) => v.length >= 12 && /[A-Z]/.test(v) && /\d/.test(v), "Use at least 12 characters with an uppercase letter and a number."),
    conf: z.string(),
  })
  .refine((v) => v.nw === v.conf, { path: ["conf"], message: "The new passwords don't match." });
type PasswordValues = z.infer<typeof passwordSchema>;

const SESSIONS = [
  { device: "This browser", where: "Current session", time: "Active now" },
  { device: "iPhone · Safari (example)", where: "Last week", time: "Example only" },
];

export function ProfileForm() {
  const dispatch = useAppDispatch();
  const me = useMe();
  const [error, setError] = useState("");
  const defaults: ProfileValues = { name: me.name, preferred: me.preferred ?? "" };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), mode: "onChange", defaultValues: defaults });

  const submit = handleSubmit((values) => {
    const res = dispatch(saveClientProfile(values));
    if (res.ok) {
      setError("");
      reset({ name: values.name.trim(), preferred: values.preferred.trim() });
    } else setError(res.error ?? "");
  });

  return (
    <form onSubmit={submit} noValidate className="card card-b">
      <span className="h3">Personal profile</span>
      <FieldRow className="items-start">
        <Field label="Full name" error={errors.name?.message ?? error}>
          {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" invalid={Boolean(errors.name ?? error)} {...register("name")} />}
        </Field>
        <Field label="Preferred name (optional)">{(id) => <Input id={id} {...register("preferred")} />}</Field>
      </FieldRow>
      <div className="flex justify-end gap-2">
        <Button disabled={!isDirty} onClick={() => reset(defaults)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!isDirty || !isValid}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

export function ContactForm() {
  const dispatch = useAppDispatch();
  const me = useMe();
  const [error, setError] = useState("");
  const defaults: ContactValues = { phone: me.phone ?? "", contactPref: me.contactPref ?? "Portal message", address: me.address ?? "" };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<ContactValues>({ resolver: zodResolver(contactSchema), mode: "onChange", defaultValues: defaults });

  const submit = handleSubmit((values) => {
    const res = dispatch(saveClientContact(values));
    if (res.ok) {
      setError("");
      reset({ phone: values.phone.trim(), contactPref: values.contactPref, address: values.address.trim() });
    } else setError(res.error ?? "");
  });

  return (
    <form onSubmit={submit} noValidate className="card card-b">
      <span className="h3">Contact information</span>
      <FieldRow className="items-start">
        <Field label="Phone" error={errors.phone?.message ?? error}>
          {(id, d) => <Input id={id} aria-describedby={d} type="tel" autoComplete="tel" invalid={Boolean(errors.phone ?? error)} {...register("phone")} />}
        </Field>
        <Field label="Preferred contact">
          {(id) => (
            <Select id={id} {...register("contactPref")}>
              <option>Portal message</option>
              <option>Email</option>
              <option>Phone</option>
            </Select>
          )}
        </Field>
      </FieldRow>
      <Field label="Mailing address">{(id) => <Textarea id={id} autoComplete="street-address" {...register("address")} />}</Field>
      <div className="flex justify-end gap-2">
        <Button disabled={!isDirty} onClick={() => reset(defaults)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!isDirty || !isValid}>
          Save contact details
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const dispatch = useAppDispatch();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    mode: "onChange",
    defaultValues: { cur: "", nw: "", conf: "" },
  });

  const submit = handleSubmit((v) => {
    const res = dispatch(changePassword(v.cur, v.nw, v.conf));
    if (res.ok) {
      setError("");
      reset();
    } else setError(res.error ?? "");
  });

  return (
    <form onSubmit={submit} noValidate className="card card-b">
      <span className="h3">Change password</span>
      <FieldRow className="items-start">
        <Field label="Current password" error={errors.cur?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" invalid={Boolean(errors.cur)} {...register("cur")} />}
        </Field>
        <Field label="New password" error={errors.nw?.message} help="At least 12 characters, with an uppercase letter and a number.">
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" invalid={Boolean(errors.nw)} {...register("nw")} />}
        </Field>
        <Field label="Confirm new password" error={errors.conf?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" invalid={Boolean(errors.conf)} {...register("conf")} />}
        </Field>
      </FieldRow>
      {error ? (
        <span role="alert" className="errtxt">
          {error}
        </span>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!isValid}>
          Update password (simulated)
        </Button>
      </div>
    </form>
  );
}

export function SecurityPanel() {
  return (
    <>
      <Callout tone="lock" icon="alert">
        Simulated. This prototype has no real sign-in, so nothing on this tab changes your password or devices.
      </Callout>
      <PasswordForm />
      <section className="card card-b">
        <span className="h3">Two-factor sign-in</span>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone="q">Not connected</Badge>
          <span className="mini flex-1">Two-factor sign-in needs a real authentication service.</span>
          <Button size="sm" onClick={() => flash("Simulated: two-factor sign-in isn't connected in this prototype.")}>
            Set up two-factor
          </Button>
        </div>
      </section>
      <Card>
        <CardHeader title="Sessions" aside={<span className="help">Examples only</span>} />
        {SESSIONS.map((s) => (
          <div key={s.device} className="row">
            <span className="flex-1 text-sm font-medium">{s.device}</span>
            <span className="help">
              {s.where} · {s.time}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}
