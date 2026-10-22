"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { FOLLOW_UP_TYPES } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { dISO } from "@/lib/dates";
import { addFollowup, completeFollowup, recordInteraction } from "@/store/actions/cases";
import { userName } from "@/store/selectors";

interface DialogProps {
  onClose: () => void;
}

const typeSchema = z.enum(FOLLOW_UP_TYPES);

function useClientOptions() {
  const data = useData();
  const me = useMe();
  return data.users
    .filter((u) => u.role === "CLIENT" && u.status !== "Removed" && (me.role !== "CSR" || u.csr === me.id))
    .map((c) => ({ id: c.id, label: `${c.name} · ${c.caseId}` }));
}

function ClientSelect({
  options,
  error,
  register,
}: {
  options: Array<{ id: string; label: string }>;
  error?: string;
  register: UseFormRegisterReturn;
}) {
  return (
    <Field label="Client" error={error}>
      {(id, describedBy) => (
        <Select id={id} aria-describedby={describedBy} invalid={Boolean(error)} {...register}>
          <option value="">Select a client</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function TypeSelect({ label, register }: { label: string; register: UseFormRegisterReturn }) {
  return (
    <Field label={label}>
      {(id) => (
        <Select id={id} {...register}>
          {FOLLOW_UP_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      )}
    </Field>
  );
}

const addSchema = z.object({
  client: z.string().min(1, "Choose a client."),
  type: typeSchema,
  due: z.string().min(1, "Choose a due date."),
  note: z.string().trim().min(1, "Add what the follow-up is about."),
});
type AddValues = z.infer<typeof addSchema>;

export function AddFollowupDialog({ clientId, onClose }: DialogProps & { clientId?: string }) {
  const dispatch = useAppDispatch();
  const options = useClientOptions();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    mode: "onChange",
    defaultValues: { client: clientId ?? "", type: "Call", due: dISO(1), note: "" },
  });

  const submit = handleSubmit((values) => {
    const result = dispatch(addFollowup(values));
    if (result.ok) onClose();
    else if (result.error) setError("note", { message: result.error });
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Add follow-up reminder">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <ClientSelect options={options} error={errors.client?.message} register={register("client")} />
          <TypeSelect label="Type" register={register("type")} />
          <Field label="Due" error={errors.due?.message}>
            {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.due)} {...register("due")} />}
          </Field>
        </FieldRow>
        <Field label="What it's about" error={errors.note?.message}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.note)}
              placeholder="e.g. Confirm the bank statement upload"
              {...register("note")}
            />
          )}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid}>
            Add reminder
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

const completeSchema = z.object({ outcome: z.string().trim().min(1, "Record what happened.") });
type CompleteValues = z.infer<typeof completeSchema>;

export function CompleteFollowupDialog({ followupId, onClose }: DialogProps & { followupId: number }) {
  const data = useData();
  const dispatch = useAppDispatch();
  const followup = data.followups.find((f) => f.id === followupId);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<CompleteValues>({ resolver: zodResolver(completeSchema), mode: "onChange", defaultValues: { outcome: "" } });

  const submit = handleSubmit((values) => {
    const result = dispatch(completeFollowup(followupId, values.outcome));
    if (result.ok) onClose();
    else if (result.error) setError("outcome", { message: result.error });
  });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Complete follow-up"
      description={followup ? `${followup.type} with ${userName(data, followup.client)} · ${followup.note}` : undefined}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Field label="Outcome" error={errors.outcome?.message}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.outcome)}
              placeholder="What happened? This is added to the client's relationship timeline."
              {...register("outcome")}
            />
          )}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="ok" disabled={!isValid}>
            Mark complete
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

const interactionSchema = z.object({
  client: z.string().min(1, "Choose a client."),
  kind: typeSchema,
  text: z.string().trim().min(1, "Summarize the interaction."),
});
type InteractionValues = z.infer<typeof interactionSchema>;

export function InteractionDialog({ clientId, onClose }: DialogProps & { clientId?: string }) {
  const dispatch = useAppDispatch();
  const options = useClientOptions();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<InteractionValues>({
    resolver: zodResolver(interactionSchema),
    mode: "onChange",
    defaultValues: { client: clientId ?? "", kind: "Call", text: "" },
  });

  const submit = handleSubmit((values) => {
    const result = dispatch(recordInteraction(values));
    if (result.ok) onClose();
    else if (result.error) setError("text", { message: result.error });
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Record client interaction">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <ClientSelect options={options} error={errors.client?.message} register={register("client")} />
          <TypeSelect label="Type" register={register("kind")} />
        </FieldRow>
        <Field label="Summary" error={errors.text?.message}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.text)}
              placeholder="Client-facing summary. Don't paste document contents."
              {...register("text")}
            />
          )}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid}>
            Save interaction
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
