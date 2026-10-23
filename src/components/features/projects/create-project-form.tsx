"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ClientChooser } from "@/components/features/followups/followup-dialogs";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { FORMATION_STATES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useCreateCaseMutation } from "@/store/api/cases";

const schema = z.object({
  clientId: z.string().min(1, "Select a client."),
  formationState: z.string().min(1),
  businessName: z.string().max(120, "Keep the business name under 120 characters."),
});
type Values = z.infer<typeof schema>;

const DEFAULTS: Values = { clientId: "", formationState: FORMATION_STATES[0], businessName: "" };
const inDays = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A quick LLC formation case for a client with no open case (the full form is New case in Case management). */
export function CreateProjectForm() {
  const run = useAction();
  const [create, { isLoading }] = useCreateCaseMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  const submit = handleSubmit(async (values) => {
    const outcome = await run(
      create({ clientId: values.clientId, serviceId: "llc", deadline: inDays(30), formationState: values.formationState, businessName: values.businessName.trim() || undefined }),
      { success: "Project created", setError, fields: ["clientId", "formationState", "businessName"] },
    );
    if (outcome.ok) reset(DEFAULTS);
  });

  return (
    <section className="card flex flex-col gap-2.5 p-3.5">
      <span className="h3">Create formation project</span>
      <form onSubmit={submit} noValidate>
        <FieldRow>
          <ClientChooser register={register("clientId")} error={errors.clientId?.message} />
          <Field label="State of formation">
            {(id) => (
              <Select id={id} {...register("formationState")}>
                {FORMATION_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Business name" error={errors.businessName?.message}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.businessName)} placeholder="If known" {...register("businessName")} />}
          </Field>
          <Button type="submit" variant="primary" className="!min-w-0 !flex-none" disabled={isLoading}>
            {isLoading ? "Creating…" : "Create project"}
          </Button>
        </FieldRow>
      </form>
    </section>
  );
}
