"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { useAppDispatch, useData } from "@/hooks/useStore";
import { saveAnnouncement } from "@/store/actions/comms";

const schema = z.object({
  title: z.string().trim().min(1, "Add a title."),
  aud: z.string().min(1),
  prio: z.enum(["Normal", "Important", "Urgent"]),
  msg: z.string().trim().min(1, "Add a message."),
  exp: z.string(),
  ack: z.boolean(),
});
type Values = z.infer<typeof schema>;

const DEFAULTS: Values = { title: "", aud: "all", prio: "Normal", msg: "", exp: "", ack: false };

/** Compose an announcement for all clients or one client, saved as a draft or published at once. */
export function AnnouncementForm() {
  const data = useData();
  const dispatch = useAppDispatch();
  const clients = data.users.filter((u) => u.role === "CLIENT" && u.status === "Active");
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: DEFAULTS, mode: "onChange" });

  const submit = (publish: boolean) =>
    handleSubmit((values) => {
      const result = dispatch(saveAnnouncement(values, publish));
      if (result.ok) reset(DEFAULTS);
      else setError("title", { message: result.error });
    });

  return (
    <form onSubmit={submit(true)} noValidate className="card flex flex-col gap-2.5 p-3.5">
      <FieldRow>
        <Field label="Title" error={errors.title?.message}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.title)} {...register("title")} />}
        </Field>
        <Field label="Audience">
          {(id) => (
            <Select id={id} {...register("aud")}>
              <option value="all">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.caseId}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Priority" className="!flex-none sm:!basis-[150px]">
          {(id) => (
            <Select id={id} {...register("prio")}>
              <option>Normal</option>
              <option>Important</option>
              <option>Urgent</option>
            </Select>
          )}
        </Field>
      </FieldRow>
      <Field label="Message" error={errors.msg?.message}>
        {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} invalid={Boolean(errors.msg)} {...register("msg")} />}
      </Field>
      <FieldRow>
        <Field label="Expiry date (optional)">{(id) => <Input id={id} type="date" {...register("exp")} />}</Field>
        <label className="flex flex-[1_1_200px] items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-primary" {...register("ack")} />
          Require acknowledgement
        </label>
        <Button onClick={submit(false)} disabled={!isValid}>
          Save draft
        </Button>
        <Button type="submit" variant="primary" disabled={!isValid}>
          Publish now
        </Button>
      </FieldRow>
    </form>
  );
}
