"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { DOC_TYPES } from "@/constants/vocab";
import { can } from "@/lib/permissions";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { requestDocument, shareDocument, validateFile } from "@/store/actions/comms";

const schema = z.object({
  client: z.string().min(1, "Choose a client."),
  name: z.string().trim().min(1, "Enter a document name."),
  type: z.string(),
  note: z.string(),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { client: "", name: "", type: "", note: "" };

/** Request a document from a client, or upload a file and share it with them. Uploads are simulated. */
export function RequestForm() {
  const dispatch = useAppDispatch();
  const data = useData();
  const me = useMe();
  const canManage = can(me, "docsManage");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const [formError, setFormError] = useState("");

  const {
    register,
    handleSubmit,
    getValues,
    setError,
    reset,
    formState: { errors, isValid },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY, mode: "onChange" });

  const clients = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed");

  const finish = (error?: string) => {
    if (error && error !== "Not allowed.") setFormError(error);
    else if (!error) {
      setFormError("");
      reset(EMPTY);
    }
  };

  const request = handleSubmit((values) => {
    finish(dispatch(requestDocument(values)).error);
  });

  const share = (fileName: string) => {
    const { client, name } = getValues();
    finish(dispatch(shareDocument({ client, name, fileName })).error);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!getValues("client")) {
      setError("client", { message: "Choose a client first." });
      return;
    }
    const problem = validateFile(file);
    setFileError(problem);
    if (!problem) share(file.name);
  };

  const sample = () => {
    setFileError("");
    share(`${getValues("name").trim() || "Document"} (sample).pdf`);
  };

  const variant = canManage ? "default" : "locked";

  return (
    <section className="card flex flex-col gap-2.5 p-3.5">
      <span className="h3">Request or upload a document</span>
      <FieldRow>
        <Field label="Client" error={errors.client?.message}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.client)} {...register("client")}>
              <option value="">Select client</option>
              {clients.map((c) => (
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
      <Field label="Note to the client (optional)">
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
        <Button variant={canManage ? "primary" : "locked"} disabled={canManage && !isValid} onClick={request}>
          {canManage ? null : <Icon name="lock" small />}
          Request from client
        </Button>
        <Button variant={variant} onClick={() => fileRef.current?.click()}>
          {canManage ? <Icon name="upload" small /> : <Icon name="lock" small />}
          Upload &amp; share with client
        </Button>
        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.pdf,.docx" className="sr-only" tabIndex={-1} aria-label="Choose a file to share" onChange={onPick} />
        <Button variant={canManage ? "ghost" : "locked"} disabled={canManage && !isValid} onClick={sample}>
          {canManage ? null : <Icon name="lock" small />}
          Share sample file
        </Button>
      </div>
    </section>
  );
}
