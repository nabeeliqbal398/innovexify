"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { PRIORITIES, REPORT_CATEGORIES } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { submitReport } from "@/store/actions/comms";
import type { Priority } from "@/types/domain";

const schema = z.object({
  client: z.string().min(1, "Select one of your clients."),
  title: z.string().trim().min(1, "Enter a subject."),
  category: z.string().min(1),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
  body: z.string().trim().min(1, "Describe what Compliance needs to know."),
  action: z.string(),
});
type Values = z.infer<typeof schema>;

const DEFAULTS: Values = { client: "", title: "", category: REPORT_CATEGORIES[0], priority: "Normal", body: "", action: "" };

/** CSR form for a new report to Compliance, limited to the CSR's own clients. */
export function ReportForm({ onSubmitted }: { onSubmitted: (id: string) => void }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const clients = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed" && u.csr === me.id);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: DEFAULTS, mode: "onChange" });

  const submit = handleSubmit((values) => {
    const result = dispatch(submitReport({ ...values, priority: values.priority as Priority }));
    if (!result.ok) {
      setError("client", { message: result.error });
      return;
    }
    reset(DEFAULTS);
    if (typeof result.id === "string") onSubmitted(result.id);
  });

  return (
    <form onSubmit={submit} noValidate className="card flex flex-col gap-2.5 p-3.5">
      <span className="h3">New report to Compliance</span>
      <FieldRow>
        <Field label="Client and case" error={errors.client?.message}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.client)} {...register("client")}>
              <option value="">Select one of your clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.caseId}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Subject" error={errors.title?.message}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.title)} {...register("title")} />}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Category">
          {(id) => (
            <Select id={id} {...register("category")}>
              {REPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Priority" className="!flex-none sm:!basis-40">
          {(id) => (
            <Select id={id} {...register("priority")}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </FieldRow>
      <Field label="Description" error={errors.body?.message}>
        {(id, describedBy) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={Boolean(errors.body)}
            placeholder="What the client said and what's missing. Describe documents in words; don't attach them."
            {...register("body")}
          />
        )}
      </Field>
      <Field label="Requested action (optional)">
        {(id) => <Input id={id} placeholder="What do you need Compliance to do?" {...register("action")} />}
      </Field>
      <div className="flex items-center justify-end gap-2">
        <span className="help flex-1">File attachments aren&apos;t available in reports.</span>
        <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
          Submit to Compliance
        </Button>
      </div>
    </form>
  );
}
