"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { QueryState } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { flash } from "@/lib/toast";
import { useCompanyQuery, useUpdateCompanyMutation } from "@/store/api/system";

const schema = z.object({
  prefix: z.string().regex(/^[A-Z]{2,8}$/, "Use 2–8 letters for the case ID prefix."),
});
type Values = z.infer<typeof schema>;

export function DefaultsForm() {
  const me = useMe();
  const run = useAction();
  const company = useCompanyQuery();
  const [save, { isLoading }] = useUpdateCompanyMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: { prefix: "" } });
  const prefix = watch("prefix");
  const year = new Date().getFullYear();

  useEffect(() => {
    if (company.data) reset({ prefix: company.data.casePrefix });
  }, [company.data, reset]);

  const onSubmit = handleSubmit(async (v) => {
    if (v.prefix === company.data?.casePrefix) return;
    // The server's message says that existing case IDs keep their old prefix.
    const outcome = await run(save({ casePrefix: v.prefix }), { setError, fields: ["casePrefix"] });
    if (outcome.ok) flash(outcome.data.message);
  });

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4" noValidate>
      <span className="h3">Case-management defaults</span>
      <QueryState query={company} isEmpty={false} empty={{ title: "" }} rows={2}>
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
                  onChange: (e) => setValue("prefix", String(e.target.value).toUpperCase().replace(/[^A-Z]/g, ""), { shouldValidate: true }),
                })}
              />
            )}
          </Field>
          <div className="flex min-w-0 flex-col gap-[5px]">
            <span className="flabel">Client ID format</span>
            <div className="mono flex h-[34px] items-center rounded-md border border-border-strong bg-background px-2.5">{`${prefix || "?"}-${year}-NNNN`}</div>
          </div>
        </FieldRow>
        <span className="help">The server numbers each new client in order. A new prefix applies to case IDs created from now on; existing IDs keep theirs.</span>
        {me.role === "MANAGER" ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <Icon name="lock" small />
            <span>Company name and logo are managed by Admin.</span>
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
            {isLoading ? "Saving…" : "Save defaults"}
          </Button>
        </div>
      </QueryState>
    </form>
  );
}
