"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { PRIORITIES, REPORT_CATEGORIES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { PRIORITY, REPORT_CATEGORY } from "@/lib/api-mappers";
import { useClientsQuery } from "@/store/api/people";
import { useSubmitReportMutation } from "@/store/api/reports";

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

// Server field names that differ from this form's.
const FIELD_OF: Record<string, keyof Values> = { clientId: "client", title: "title", category: "category", priority: "priority", body: "body", action: "action" };

/** CSR form for a new report to Compliance, limited to the CSR's own clients (the clients list is already scoped to them). */
export function ReportForm({ onSubmitted }: { onSubmitted: (id: string) => void }) {
  const run = useAction();
  const [submitReport, { isLoading }] = useSubmitReportMutation();
  const clients = useClientsQuery({ limit: 100, sort: "name", order: "asc" });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: DEFAULTS, mode: "onChange" });

  const submit = handleSubmit(async (values) => {
    const outcome = await run(
      submitReport({
        clientId: values.client,
        title: values.title,
        body: values.body,
        category: REPORT_CATEGORY.toKey(values.category),
        priority: PRIORITY.toKey(values.priority),
        action: values.action.trim() || undefined,
      }),
      { success: "Report sent to Compliance", quiet: true },
    );
    if (outcome.ok) {
      reset(DEFAULTS);
      onSubmitted(outcome.data.id);
      return;
    }
    const e = outcome.error;
    if (e.errorCode === "PERMISSION_DENIED") return;
    const known = e.fieldErrors.filter((fe) => FIELD_OF[fe.field]);
    if (known.length) known.forEach((fe) => setError(FIELD_OF[fe.field] as keyof Values, { message: fe.message }));
    else setError("client", { message: e.message });
  });

  return (
    <form onSubmit={submit} noValidate className="card flex flex-col gap-2.5 p-3.5">
      <span className="h3">New report to Compliance</span>
      <FieldRow>
        <Field label="Client and case" error={errors.client?.message}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.client)} {...register("client")}>
              <option value="">{clients.isLoading ? "Loading your clients…" : "Select one of your clients"}</option>
              {(clients.data?.items ?? []).map((c) => (
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
            placeholder="What the client said and what is missing. Describe documents in words; do not attach them."
            {...register("body")}
          />
        )}
      </Field>
      <Field label="Requested action (optional)">
        {(id) => <Input id={id} placeholder="What do you need Compliance to do?" {...register("action")} />}
      </Field>
      <div className="flex items-center justify-end gap-2">
        <span className="help flex-1">File attachments are not available in reports.</span>
        <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
          {isLoading ? "Sending…" : "Submit to Compliance"}
        </Button>
      </div>
    </form>
  );
}
