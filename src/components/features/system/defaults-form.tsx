"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { saveCasePrefix } from "@/store/actions/people";

const schema = z.object({
  prefix: z.string().regex(/^[A-Z]{2,8}$/, "Use 2–8 letters for the case ID prefix."),
});
type Values = z.infer<typeof schema>;

export function DefaultsForm() {
  const dispatch = useAppDispatch();
  const me = useMe();
  const { company, counters } = useData();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: { prefix: company.casePrefix } });
  const prefix = watch("prefix");
  const preview = `${prefix || "?"}-2026-${String(counters.nextCase).padStart(4, "0")}`;

  const onSubmit = handleSubmit((v) => {
    const res = dispatch(saveCasePrefix(v.prefix));
    if (!res.ok) setError("prefix", { message: res.error });
  });

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4" noValidate>
      <span className="h3">Case-management defaults</span>
      <FieldRow>
        <Field label="Case ID prefix" error={errors.prefix?.message}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              className="mono"
              maxLength={8}
              invalid={!!errors.prefix}
              {...register("prefix", {
                onChange: (e) =>
                  setValue("prefix", String(e.target.value).toUpperCase().replace(/[^A-Z]/g, ""), {
                    shouldValidate: true,
                  }),
              })}
            />
          )}
        </Field>
        <div className="flex min-w-0 flex-col gap-[5px]">
          <span className="flabel">Next client ID</span>
          <div className="mono flex h-[34px] items-center rounded-md border border-border-strong bg-background px-2.5">
            {preview}
          </div>
        </div>
      </FieldRow>
      <span className="help">
        Applies to new case IDs only; existing IDs keep their format. The server enforces uniqueness in production.
      </span>
      {me.role === "MANAGER" ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          <Icon name="lock" small />
          <span>Company name and logo are managed by Admin.</span>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
          Save defaults
        </Button>
      </div>
    </form>
  );
}
