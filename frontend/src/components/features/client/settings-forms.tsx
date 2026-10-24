"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "@/lib/z";

import { QueryState } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { useAction } from "@/hooks/useAction";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { contactPreferenceKey } from "@/lib/api-mappers";
import { signOut } from "@/lib/session";
import { flash } from "@/lib/toast";
import { PASSWORD_RULES } from "@/lib/validators";
import { useChangePasswordMutation, useLogoutAllMutation } from "@/store/api/auth";
import { useClientQuery, useRenameUserMutation, useUpdateClientProfileMutation } from "@/store/api/people";
import { sessionActions } from "@/store/sessionSlice";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your full name.").max(120, "Keep your name under 120 characters."),
  preferred: z.string().max(120, "Keep it under 120 characters."),
});
type ProfileValues = z.infer<typeof profileSchema>;

const contactSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine((v) => !v || /^[+()\d\s-]{7,20}$/.test(v), "Enter a phone number using digits, spaces, +, - or brackets."),
  contactPref: z.string(),
  address: z.string().max(300, "Keep the address under 300 characters."),
});
type ContactValues = z.infer<typeof contactSchema>;

const passwordSchema = z
  .object({
    cur: z.string().min(1, "Enter your current password."),
    nw: z.string().refine((v) => PASSWORD_RULES.every((r) => r.test(v)), "Use at least 12 characters with upper and lowercase letters and a number."),
    conf: z.string(),
  })
  .refine((v) => v.nw === v.conf, { path: ["conf"], message: "The new passwords don't match." });
type PasswordValues = z.infer<typeof passwordSchema>;

export function ProfileForm() {
  const me = useMe();
  const dispatch = useAppDispatch();
  const run = useAction();
  const profile = useClientQuery(me.id);
  const [rename, renaming] = useRenameUserMutation();
  const [updateProfile, updating] = useUpdateClientProfileMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isValid },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), mode: "onChange", defaultValues: { name: me.name, preferred: "" } });

  useEffect(() => {
    if (profile.data) reset({ name: profile.data.name, preferred: profile.data.preferred ?? "" });
  }, [profile.data, reset]);

  const submit = handleSubmit(async (values) => {
    const current = profile.data;
    if (values.name !== current?.name) {
      const done = await run(rename({ id: me.id, name: values.name }), { setError, fields: ["name"] });
      if (!done.ok) return;
      dispatch(sessionActions.userUpdated({ ...me, name: done.data.name }));
    }
    if (values.preferred !== (current?.preferred ?? "")) {
      const done = await run(updateProfile({ id: me.id, preferredName: values.preferred }), { setError, fields: ["preferredName"] });
      if (!done.ok) return;
    }
    flash("Profile saved");
    reset(values);
  });

  return (
    <form onSubmit={submit} noValidate className="card card-b">
      <span className="h3">Personal profile</span>
      <QueryState query={profile} isEmpty={false} empty={{ title: "" }} rows={2}>
        <FieldRow className="items-start">
          <Field label="Full name" error={errors.name?.message}>
            {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" invalid={Boolean(errors.name)} {...register("name")} />}
          </Field>
          <Field label="Preferred name (optional)" error={errors.preferred?.message}>
            {(id) => <Input id={id} {...register("preferred")} />}
          </Field>
        </FieldRow>
        <div className="flex justify-end gap-2">
          <Button disabled={!isDirty} onClick={() => reset({ name: profile.data?.name ?? me.name, preferred: profile.data?.preferred ?? "" })}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!isDirty || !isValid || renaming.isLoading || updating.isLoading}>
            {renaming.isLoading || updating.isLoading ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </QueryState>
    </form>
  );
}

export function ContactForm() {
  const me = useMe();
  const run = useAction();
  const profile = useClientQuery(me.id);
  const [updateProfile, { isLoading }] = useUpdateClientProfileMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isValid },
  } = useForm<ContactValues>({ resolver: zodResolver(contactSchema), mode: "onChange", defaultValues: { phone: "", contactPref: "Portal message", address: "" } });

  const defaults = (): ContactValues => ({ phone: profile.data?.phone ?? "", contactPref: profile.data?.contactPref ?? "Portal message", address: profile.data?.address ?? "" });
  useEffect(() => {
    if (profile.data) reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data, reset]);

  const submit = handleSubmit(async (values) => {
    const outcome = await run(
      updateProfile({ id: me.id, phone: values.phone.trim(), address: values.address.trim(), contactPreference: contactPreferenceKey(values.contactPref) }),
      { success: "Contact details saved", setError: (name, e) => setError(name === ("contactPreference" as never) ? "contactPref" : (name as keyof ContactValues), e), fields: ["phone", "address", "contactPreference"] },
    );
    if (outcome.ok) reset({ phone: values.phone.trim(), contactPref: values.contactPref, address: values.address.trim() });
  });

  return (
    <form onSubmit={submit} noValidate className="card card-b">
      <span className="h3">Contact information</span>
      <QueryState query={profile} isEmpty={false} empty={{ title: "" }} rows={2}>
        <FieldRow className="items-start">
          <Field label="Phone" error={errors.phone?.message}>
            {(id, d) => <Input id={id} aria-describedby={d} type="tel" autoComplete="tel" invalid={Boolean(errors.phone)} {...register("phone")} />}
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
        <Field label="Mailing address" error={errors.address?.message}>
          {(id, d) => <Textarea id={id} aria-describedby={d} autoComplete="street-address" invalid={Boolean(errors.address)} {...register("address")} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button disabled={!isDirty} onClick={() => reset(defaults())}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!isDirty || !isValid || isLoading}>
            {isLoading ? "Saving…" : "Save contact details"}
          </Button>
        </div>
      </QueryState>
    </form>
  );
}

function PasswordForm() {
  const run = useAction();
  const [change, { isLoading }] = useChangePasswordMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), mode: "onChange", defaultValues: { cur: "", nw: "", conf: "" } });

  const submit = handleSubmit(async (v) => {
    const outcome = await run(change({ currentPassword: v.cur, newPassword: v.nw }), {
      setError: (name, e) => setError(name === ("currentPassword" as never) ? "cur" : name === ("newPassword" as never) ? "nw" : (name as keyof PasswordValues), e),
      fields: ["currentPassword", "newPassword"],
      quiet: true,
    });
    if (outcome.ok) {
      flash("Password changed. Your other sessions were signed out.");
      reset();
    } else if (outcome.error.fieldErrors.length === 0 && outcome.error.errorCode !== "PERMISSION_DENIED") {
      setError("cur", { message: outcome.error.message });
    }
  });

  return (
    <form onSubmit={submit} noValidate className="card card-b">
      <span className="h3">Change password</span>
      <FieldRow className="items-start">
        <Field label="Current password" error={errors.cur?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" invalid={Boolean(errors.cur)} {...register("cur")} />}
        </Field>
        <Field label="New password" error={errors.nw?.message} help="At least 12 characters, with upper and lowercase letters and a number.">
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" invalid={Boolean(errors.nw)} {...register("nw")} />}
        </Field>
        <Field label="Confirm new password" error={errors.conf?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" invalid={Boolean(errors.conf)} {...register("conf")} />}
        </Field>
      </FieldRow>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
          {isLoading ? "Updating…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}

export function SecurityPanel() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const run = useAction();
  const [logoutAll, { isLoading }] = useLogoutAllMutation();

  const endAll = async () => {
    const outcome = await run(logoutAll());
    if (!outcome.ok) return;
    await signOut(dispatch, "You signed out of every device. Sign in again to continue.");
    router.replace("/");
  };

  return (
    <>
      <PasswordForm />
      <section className="card card-b">
        <span className="h3">Devices and sessions</span>
        <p className="mini">
          Changing your password signs out every other device. If you lost a device or think someone else has your login, sign out everywhere: you will need your password to sign back in.
        </p>
        <Callout tone="info" icon="lock">
          Two-factor sign-in is not available yet.
        </Callout>
        <div>
          <Button size="sm" variant="danger" disabled={isLoading} onClick={() => void endAll()}>
            {isLoading ? "Signing out…" : "Sign out everywhere"}
          </Button>
        </div>
      </section>
    </>
  );
}
