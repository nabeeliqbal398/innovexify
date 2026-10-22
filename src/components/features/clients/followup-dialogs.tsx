"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { FOLLOW_UP_TYPES } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { dISO } from "@/lib/dates";
import { addFollowup, completeFollowup, recordInteraction } from "@/store/actions/cases";
import { userName } from "@/store/selectors";
import { clientUsers } from "@/components/features/cases/case-data";

const typeEnum = z.enum(["Call", "Email", "Portal message", "Meeting"]);

function useClientOptions() {
  const data = useData();
  const me = useMe();
  return clientUsers(data).filter((c) => me.role !== "CSR" || c.csr === me.id);
}

function FormError({ message }: { message: string }) {
  return message ? (
    <Callout tone="warn" icon="alert" role="alert">
      {message}
    </Callout>
  ) : null;
}

const reminderSchema = z.object({
  client: z.string().min(1, "Select a client."),
  type: typeEnum,
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date."),
  note: z.string().trim().min(1, "Add what the follow-up is about.").max(200, "Keep it under 200 characters."),
});
type ReminderValues = z.infer<typeof reminderSchema>;

/** Add a follow-up reminder, optionally for a client chosen in advance. */
export function ReminderDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const clients = useClientOptions();
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ReminderValues>({
    resolver: zodResolver(reminderSchema),
    mode: "onChange",
    defaultValues: { client: clientId, type: "Call", due: dISO(1), note: "" },
  });
  const submit = handleSubmit((values) => {
    const result = dispatch(addFollowup(values));
    if (result.ok) onClose();
    else setFormError(result.error ?? "Could not add the reminder.");
  });

  return (
    <Modal open wide onOpenChange={(o) => !o && onClose()} title="Add follow-up reminder">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <Field label="Client" error={errors.client?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.client)} {...register("client")}>
                <option value="">Select a client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.caseId}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} {...register("type")}>
                {FOLLOW_UP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due" error={errors.due?.message}>
            {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.due)} {...register("due")} />}
          </Field>
        </FieldRow>
        <Field label="What it's about" error={errors.note?.message}>
          {(id, describedBy) => (
            <Input
              id={id}
              placeholder="e.g. Confirm the bank statement upload"
              aria-describedby={describedBy}
              invalid={Boolean(errors.note)}
              {...register("note")}
            />
          )}
        </Field>
        <FormError message={formError} />
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
            Add reminder
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

const interactionSchema = z.object({
  client: z.string().min(1, "Select a client."),
  kind: typeEnum,
  text: z.string().trim().min(1, "Summarize the interaction.").max(500, "Keep the summary under 500 characters."),
});
type InteractionValues = z.infer<typeof interactionSchema>;

/** Record a call, email or meeting that already happened. */
export function InteractionDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const clients = useClientOptions();
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<InteractionValues>({
    resolver: zodResolver(interactionSchema),
    mode: "onChange",
    defaultValues: { client: clientId, kind: "Call", text: "" },
  });
  const submit = handleSubmit((values) => {
    const result = dispatch(recordInteraction(values));
    if (result.ok) onClose();
    else setFormError(result.error ?? "Could not record the interaction.");
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Record client interaction">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <Field label="Client" error={errors.client?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.client)} {...register("client")}>
                <option value="">Select a client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.caseId}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} {...register("kind")}>
                {FOLLOW_UP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FieldRow>
        <Field label="Summary" error={errors.text?.message}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              placeholder="Client-facing summary. Don't paste document contents."
              aria-describedby={describedBy}
              invalid={Boolean(errors.text)}
              {...register("text")}
            />
          )}
        </Field>
        <FormError message={formError} />
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
            Save interaction
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

const outcomeSchema = z.object({ outcome: z.string().trim().min(1, "Record what happened.").max(500, "Keep the outcome under 500 characters.") });
type OutcomeValues = z.infer<typeof outcomeSchema>;

/** Mark a follow-up done and add its outcome to the client's relationship timeline. */
export function CompleteFollowupDialog({ followupId, onClose }: { followupId: number; onClose: () => void }) {
  const data = useData();
  const dispatch = useAppDispatch();
  const followup = data.followups.find((f) => f.id === followupId);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid, isSubmitting },
  } = useForm<OutcomeValues>({ resolver: zodResolver(outcomeSchema), mode: "onChange", defaultValues: { outcome: "" } });
  const submit = handleSubmit((values) => {
    const result = dispatch(completeFollowup(followupId, values.outcome));
    if (result.ok) onClose();
    else setError("outcome", { message: result.error });
  });

  return (
    <Modal
      open={Boolean(followup)}
      onOpenChange={(o) => !o && onClose()}
      title="Complete follow-up"
      description={followup ? `${followup.type} with ${userName(data, followup.client)} · ${followup.note}` : undefined}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Field label="Outcome" error={errors.outcome?.message}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              placeholder="What happened? This is added to the client's relationship timeline."
              aria-describedby={describedBy}
              invalid={Boolean(errors.outcome)}
              {...register("outcome")}
            />
          )}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="ok" disabled={!isValid || isSubmitting}>
            Mark complete
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
