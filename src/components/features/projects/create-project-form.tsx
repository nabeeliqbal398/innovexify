"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { FORMATION_STATES } from "@/constants/vocab";
import { useAppDispatch, useData } from "@/hooks/useStore";
import { createFormationProject } from "@/store/actions/cases";
import { projectOfClient } from "@/store/selectors";

const schema = z.object({
  client: z.string().min(1, "Select a client."),
  state: z.string().min(1),
  biz: z.string().max(120, "Keep the business name under 120 characters."),
});
type Values = z.infer<typeof schema>;

const DEFAULTS: Values = { client: "", state: FORMATION_STATES[0], biz: "" };

export function CreateProjectForm() {
  const data = useData();
  const dispatch = useAppDispatch();
  const clients = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed" && !projectOfClient(data, u.id));
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  const submit = handleSubmit((values) => {
    const result = dispatch(createFormationProject(values));
    if (result.ok) reset(DEFAULTS);
    else setError("client", { message: result.error });
  });

  return (
    <section className="card flex flex-col gap-2.5 p-3.5">
      <span className="h3">Create formation project</span>
      <form onSubmit={submit} noValidate>
        <FieldRow>
          <Field label="Client" error={errors.client?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.client)} {...register("client")}>
                <option value="">Select a client without a project</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.caseId}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="State of formation">
            {(id) => (
              <Select id={id} {...register("state")}>
                {FORMATION_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Business name" error={errors.biz?.message}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.biz)} placeholder="If known" {...register("biz")} />}
          </Field>
          <Button type="submit" variant="primary" className="!min-w-0 !flex-none" disabled={isSubmitting}>
            Create project
          </Button>
        </FieldRow>
      </form>
    </section>
  );
}
