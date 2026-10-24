"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "@/lib/z";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { DOC_TYPES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { DOC_TYPE } from "@/lib/api-mappers";
import { FILE_ACCEPT, validateFile } from "@/lib/file-rules";
import { can } from "@/lib/permissions";
import { useRequestDocumentMutation, useShareDocumentMutation } from "@/store/api/documents";
import { useClientsQuery } from "@/store/api/people";

const schema = z.object({
  client: z.string().min(1, "Choose a client."),
  name: z.string().trim().min(1, "Enter a document name."),
  type: z.string(),
  note: z.string().max(500, "Keep the note under 500 characters."),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { client: "", name: "", type: "", note: "" };

/** Request a document from a client, or upload a real file and share it with them. */
export function RequestForm() {
  const me = useMe();
  const run = useAction();
  const canManage = can(me, "docsManage");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const [formError, setFormError] = useState("");
  const [requestDoc, requesting] = useRequestDocumentMutation();
  const [shareDoc, sharing] = useShareDocumentMutation();
  const clients = useClientsQuery({ limit: 100, sort: "name", order: "asc" }, { skip: !canManage });

  const {
    register,
    handleSubmit,
    getValues,
    setError,
    reset,
    formState: { errors, isValid },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY, mode: "onChange" });
  const busy = requesting.isLoading || sharing.isLoading;

  const fields = ["clientId", "name", "type", "note"];
  const mapError = (name: string, e: { type: string; message?: string }) => setError((name === "clientId" ? "client" : name) as keyof FormValues, e);

  const request = handleSubmit(async (values) => {
    setFormError("");
    const outcome = await run(
      requestDoc({ clientId: values.client, name: values.name, type: values.type ? DOC_TYPE.toKey(values.type) : undefined, note: values.note.trim() || undefined }),
      { setError: mapError as never, fields, quiet: true },
    );
    if (outcome.ok) {
      reset(EMPTY);
    } else if (outcome.error.fieldErrors.length === 0 && outcome.error.errorCode !== "PERMISSION_DENIED") {
      setFormError(outcome.error.message);
    }
  });

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { client, name } = getValues();
    if (!client) {
      setError("client", { message: "Choose a client first." });
      return;
    }
    const problem = validateFile(file);
    setFileError(problem);
    if (problem) return;
    setFormError("");
    const outcome = await run(shareDoc({ clientId: client, name: name.trim() || undefined, file }), { quiet: true });
    if (outcome.ok) reset(EMPTY);
    else if (outcome.error.errorCode !== "PERMISSION_DENIED") setFileError(outcome.error.message);
  };

  const lockedTitle = canManage ? undefined : "Your role cannot do this; selecting it explains why.";

  return (
    <section className="card flex flex-col gap-2.5 p-3.5">
      <span className="h3">Request or upload a document</span>
      <FieldRow>
        <Field label="Client" error={errors.client?.message}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.client)} {...register("client")}>
              <option value="">{clients.isLoading ? "Loading clients…" : "Select client"}</option>
              {(clients.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.caseId}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Document name" error={errors.name?.message}>
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.name)} placeholder="e.g. Proof of address (Sep 2026)" {...register("name")} />
          )}
        </Field>
        <Field label="Type" className="!flex-[0_1_170px]">
          {(id) => (
            <Select id={id} {...register("type")}>
              <option value="">Other</option>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </FieldRow>
      <Field label="Note to the client (optional)" error={errors.note?.message}>
        {(id) => <Input id={id} placeholder="For example: must be dated within the last 3 months" {...register("note")} />}
      </Field>
      {formError ? (
        <span role="alert" className="errtxt">
          {formError}
        </span>
      ) : null}
      {fileError ? (
        <span role="alert" className="errtxt">
          {fileError}
        </span>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant={canManage ? "primary" : "locked"} title={lockedTitle} disabled={(canManage && !isValid) || busy} onClick={request}>
          {canManage ? null : <Icon name="lock" small />}
          {requesting.isLoading ? "Requesting…" : "Request from client"}
        </Button>
        <Button variant={canManage ? "default" : "locked"} title={lockedTitle} disabled={busy} onClick={() => fileRef.current?.click()}>
          {canManage ? <Icon name="upload" small /> : <Icon name="lock" small />}
          {sharing.isLoading ? "Uploading…" : "Upload & share with client"}
        </Button>
        <input ref={fileRef} type="file" accept={FILE_ACCEPT} className="sr-only" tabIndex={-1} aria-label="Choose a file to share" onChange={(e) => void onPick(e)} />
      </div>
      <span className="help">PDF, PNG, JPG or DOCX, up to 25 MB. The server checks the file itself before it is kept.</span>
    </section>
  );
}
