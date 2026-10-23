"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input } from "@/components/ui/form";
import { ROLE_LABEL } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { useRenameUserMutation } from "@/store/api/people";
import { sessionActions } from "@/store/sessionSlice";

const schema = z.object({ name: z.string().trim().min(1, "Enter your full name.").max(120, "Keep your name under 120 characters.") });
type Values = z.infer<typeof schema>;

export function ProfileForm() {
  const me = useMe();
  const dispatch = useAppDispatch();
  const run = useAction();
  const [rename, { isLoading }] = useRenameUserMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: { name: me.name } });
  const canChangeEmail = me.role === "ADMIN" || me.role === "MANAGER";

  const onSubmit = handleSubmit(async (v) => {
    const outcome = await run(rename({ id: me.id, name: v.name }), { success: "Profile saved", setError, fields: ["name"] });
    if (outcome.ok) dispatch(sessionActions.userUpdated({ ...me, name: outcome.data.name }));
  });

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4" noValidate>
      <span className="h3">My profile</span>
      <FieldRow className="!items-start">
        <Field label="Full name" error={errors.name?.message}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={!!errors.name} {...register("name")} />}
        </Field>
        <Field label="Login email" help={canChangeEmail ? "Change login emails from Staff & Invitations." : "Ask an Admin or Manager to change your email."}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} readOnly value={me.email} />}
        </Field>
        <Field label="Role">{(id) => <Input id={id} readOnly value={ROLE_LABEL[me.role]} />}</Field>
      </FieldRow>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!isValid || !isDirty || isLoading}>
          {isLoading ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
