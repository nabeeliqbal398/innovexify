"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Textarea } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { can } from "@/lib/permissions";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { saveService } from "@/store/actions/cases";
import type { Service } from "@/types/domain";

const schema = z.object({
  desc: z.string().trim().min(1, "Add a short description."),
  turnaround: z.string(),
  fee: z.string(),
  active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function ServiceBody({ service }: { service: Service }) {
  const dispatch = useAppDispatch();
  const me = useMe();
  const canEdit = can(me, "manageServices");
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { desc: service.desc, turnaround: service.turnaround, fee: service.fee, active: service.active },
  });

  const submit = handleSubmit((values) => {
    const result = dispatch(saveService(service.id, values));
    if (result.ok) {
      setFormError("");
      reset(values);
    } else if (result.error && result.error !== "Not allowed.") setFormError(result.error);
  });

  return (
    <>
      <Callout tone="lock" icon="alert">
        Fee and turnaround are internal demo fields, not prices or guarantees shown to clients.
      </Callout>
      {canEdit ? (
        <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
          <Field label="Description" error={errors.desc?.message}>
            {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} invalid={Boolean(errors.desc)} {...register("desc")} />}
          </Field>
          <FieldRow>
            <Field label="Expected turnaround">{(id) => <Input id={id} placeholder="Not set" {...register("turnaround")} />}</Field>
            <Field label="Applicable fees">{(id) => <Input id={id} placeholder="Not set" {...register("fee")} />}</Field>
          </FieldRow>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-[18px] accent-primary" {...register("active")} />
            Offered to clients
          </label>
          {formError ? (
            <Callout tone="warn" role="alert">
              {formError}
            </Callout>
          ) : null}
          <Button type="submit" variant="primary" className="self-start" disabled={!isValid || isSubmitting}>
            Save service
          </Button>
        </form>
      ) : (
        <>
          <p className="mini">{service.desc}</p>
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-[18px] gap-y-3">
            <div>
              <dt className="help">Expected turnaround</dt>
              <dd className="mt-0.5 text-sm font-medium">{service.turnaround || "Not set"}</dd>
            </div>
            <div>
              <dt className="help">Applicable fees</dt>
              <dd className="mt-0.5 text-sm font-medium">{service.fee || "Not set"}</dd>
            </div>
          </dl>
          <span className="help">Only Admin and Manager can edit the catalog.</span>
        </>
      )}
      <div className="stack-8">
        <span className="flabel">Requirements</span>
        <ul className="m-0 list-disc pl-[18px] text-sm">
          {service.reqs.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="stack-8">
        <span className="flabel">Workflow stages</span>
        <ol className="m-0 list-decimal pl-[18px] text-sm">
          {service.stages.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
    </>
  );
}

interface ServiceDrawerProps {
  serviceId: string | null;
  onClose: () => void;
}

export function ServiceDrawer({ serviceId, onClose }: ServiceDrawerProps) {
  const data = useData();
  const service = data.services.find((s) => s.id === serviceId);
  return (
    <Drawer
      open={Boolean(service)}
      onOpenChange={(open) => !open && onClose()}
      title={service?.name ?? "Service"}
      subtitle={service ? `${service.category} · ${service.active ? "Offered" : "Not offered"}` : undefined}
    >
      {service ? <ServiceBody key={service.id} service={service} /> : null}
    </Drawer>
  );
}
