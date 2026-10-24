"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "@/lib/z";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Textarea } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { can } from "@/lib/permissions";
import { flash } from "@/lib/toast";
import { useSetServiceActiveMutation, useUpdateServiceMutation } from "@/store/api/system";
import type { Service } from "@/types/domain";

const schema = z.object({
  desc: z.string().trim().min(2, "Add a short description.").max(500, "Keep the description under 500 characters."),
  turnaround: z.string().max(80, "Keep it under 80 characters."),
  fee: z.string().max(80, "Keep it under 80 characters."),
  active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function ServiceBody({ service }: { service: Service }) {
  const me = useMe();
  const run = useAction();
  const canEdit = can(me, "manageServices");
  const [update, updating] = useUpdateServiceMutation();
  const [setActive, switching] = useSetServiceActiveMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { desc: service.desc, turnaround: service.turnaround, fee: service.fee, active: service.active },
  });

  const submit = handleSubmit(async (values) => {
    // Description, turnaround and fee are one edit; switching the service on or off is its own request, as on the server.
    const edit: { description?: string; turnaround?: string; fee?: string } = {};
    if (values.desc !== service.desc) edit.description = values.desc;
    if (values.turnaround !== service.turnaround) edit.turnaround = values.turnaround;
    if (values.fee !== service.fee) edit.fee = values.fee;
    if (Object.keys(edit).length > 0) {
      const outcome = await run(update({ id: service.id, ...edit }), { setError, fields: ["description", "turnaround", "fee"] });
      if (!outcome.ok) return;
    }
    if (values.active !== service.active) {
      const outcome = await run(setActive({ id: service.id, active: values.active }), {
        success: values.active ? "Service switched on." : "Service switched off. Cases already opened for it are unchanged.",
      });
      if (!outcome.ok) return;
    } else if (Object.keys(edit).length > 0) {
      flash("Service saved.");
    }
    reset(values);
  });

  return (
    <>
      <Callout tone="lock" icon="alert">
        Fee and turnaround are internal fields, not prices or guarantees shown to clients.
      </Callout>
      {canEdit ? (
        <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
          <Field label="Description" error={errors.desc?.message}>
            {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} invalid={Boolean(errors.desc)} {...register("desc")} />}
          </Field>
          <FieldRow>
            <Field label="Expected turnaround" error={errors.turnaround?.message}>
              {(id) => <Input id={id} placeholder="Not set" {...register("turnaround")} />}
            </Field>
            <Field label="Applicable fees" error={errors.fee?.message}>
              {(id) => <Input id={id} placeholder="Not set" {...register("fee")} />}
            </Field>
          </FieldRow>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-[18px] accent-primary" {...register("active")} />
            Offered to clients
          </label>
          <Button type="submit" variant="primary" className="self-start" disabled={!isValid || updating.isLoading || switching.isLoading}>
            {updating.isLoading || switching.isLoading ? "Saving…" : "Save service"}
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
  service: Service | null;
  onClose: () => void;
}

export function ServiceDrawer({ service, onClose }: ServiceDrawerProps) {
  return (
    <Drawer
      open={Boolean(service)}
      onOpenChange={(open) => !open && onClose()}
      title={service?.name ?? "Service"}
      subtitle={service ? `${service.category} · ${service.active ? "Offered" : "Not offered"}` : undefined}
    >
      {service ? <ServiceBody key={`${service.id}-${service.desc}-${service.active}`} service={service} /> : null}
    </Drawer>
  );
}
