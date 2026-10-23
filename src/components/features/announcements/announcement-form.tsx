"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/hooks/useAction";
import { useClientsQuery } from "@/store/api/people";
import { ANNOUNCEMENT_PRIORITY } from "@/lib/api-mappers";
import {
  useCreateAnnouncementMutation,
  usePublishAnnouncementMutation,
  useUpdateAnnouncementMutation,
} from "@/store/api/announcements";
import type { Announcement, AnnouncementPriority } from "@/types/domain";

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
const FIELDS = ["title", "message", "audience", "priority", "expiresAt", "requireAck"] as const;
/** The API's field names mapped back onto this form's inputs. */
const FIELD_OF: Record<string, keyof Values> = { title: "title", message: "msg", audience: "aud", priority: "prio", expiresAt: "exp", requireAck: "ack" };

const valuesOf = (a: Announcement): Values => ({ title: a.title, aud: a.aud, prio: a.prio, msg: a.msg, exp: a.exp, ack: a.ack });

/**
 * Compose an announcement for all clients or one client, saved as a draft or published at once. With `editing` it changes a
 * draft (only drafts can be edited: a published one may already have been read, so it is archived and replaced instead).
 */
export function AnnouncementForm({ editing, onDone }: { editing?: Announcement | null; onDone?: () => void }) {
  const run = useAction();
  const clients = useClientsQuery({ status: "ACTIVE", limit: 100, sort: "name", order: "asc" });
  const [create, createState] = useCreateAnnouncementMutation();
  const [update, updateState] = useUpdateAnnouncementMutation();
  const [publishDraft, publishState] = usePublishAnnouncementMutation();
  const busy = createState.isLoading || updateState.isLoading || publishState.isLoading;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: editing ? valuesOf(editing) : DEFAULTS, mode: "onChange" });

  useEffect(() => {
    reset(editing ? valuesOf(editing) : DEFAULTS);
  }, [editing, reset]);

  const onFieldError = (name: string, error: { type?: string; message?: string }) =>
    setError((FIELD_OF[name] ?? "title") as keyof Values, { type: error.type ?? "server", message: error.message });

  const submit = (publish: boolean) =>
    handleSubmit(async (v) => {
      const body = {
        title: v.title.trim(),
        message: v.msg.trim(),
        audience: v.aud,
        priority: ANNOUNCEMENT_PRIORITY.toKey(v.prio as AnnouncementPriority),
        requireAck: v.ack,
      };
      const opts = { setError: onFieldError as never, fields: FIELDS };
      if (editing) {
        const saved = await run(update({ id: editing.id, ...body, expiresAt: v.exp || null }), { ...opts, success: publish ? undefined : "Draft saved." });
        if (!saved.ok) return;
        if (publish) {
          const published = await run(publishDraft(editing.id), { success: "Published. Clients were notified in-app." });
          if (!published.ok) return;
        }
        onDone?.();
        return;
      }
      const created = await run(create({ ...body, expiresAt: v.exp || undefined, publish }), {
        ...opts,
        success: publish ? "Published. Clients were notified in-app." : "Draft saved.",
      });
      if (created.ok) reset(DEFAULTS);
    });

  return (
    <form onSubmit={submit(true)} noValidate className="card flex flex-col gap-2.5 p-3.5" aria-label={editing ? "Edit draft announcement" : "New announcement"}>
      {editing ? <span className="h3">Editing draft: {editing.title}</span> : null}
      <FieldRow>
        <Field label="Title" error={errors.title?.message}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.title)} {...register("title")} />}
        </Field>
        <Field label="Audience" error={errors.aud?.message}>
          {(id) => (
            <Select id={id} {...register("aud")}>
              <option value="all">All clients</option>
              {(clients.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.caseId}
                </option>
              ))}
              {editing && editing.aud !== "all" && !(clients.data?.items ?? []).some((c) => c.id === editing.aud) ? (
                <option value={editing.aud}>{editing.audName}</option>
              ) : null}
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
        <Field label="Expiry date (optional)" error={errors.exp?.message}>
          {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.exp)} {...register("exp")} />}
        </Field>
        <label className="flex flex-[1_1_200px] items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-primary" {...register("ack")} />
          Require acknowledgement
        </label>
        {editing ? <Button onClick={onDone}>Cancel</Button> : null}
        <Button onClick={submit(false)} disabled={!isValid || busy}>
          {editing ? "Save draft" : "Save draft"}
        </Button>
        <Button type="submit" variant="primary" disabled={!isValid || busy}>
          {busy ? "Working…" : "Publish now"}
        </Button>
      </FieldRow>
    </form>
  );
}
