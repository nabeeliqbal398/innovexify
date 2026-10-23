"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { QueryState } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input } from "@/components/ui/form";
import { useAction } from "@/hooks/useAction";
import { useCompanyQuery, useUpdateCompanyMutation } from "@/store/api/system";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a company name (2–60 characters).").max(60, "Enter a company name (2–60 characters)."),
});
type Values = z.infer<typeof schema>;

/** The same limits as the server, so most mistakes are caught before the upload; the server still checks the real file bytes. */
const LOGO_TYPES = ["image/png", "image/jpeg"];
const MAX_LOGO = 200 * 1024;

export function BrandingForm() {
  const run = useAction();
  const company = useCompanyQuery();
  const [save, { isLoading }] = useUpdateCompanyMutation();
  const [logo, setLogo] = useState("");
  const [logoError, setLogoError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isValid },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: { name: "" } });
  const previewName = watch("name").trim() || "—";

  useEffect(() => {
    if (company.data) {
      reset({ name: company.data.name });
      setLogo(company.data.logo);
    }
  }, [company.data, reset]);

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError("Logo must be a PNG or JPG file.");
      return;
    }
    if (file.size > MAX_LOGO) {
      setLogoError("Logo must be 200 KB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoError(undefined);
      setLogo(String(reader.result));
    };
    reader.onerror = () => setLogoError("We could not read that file.");
    reader.readAsDataURL(file);
  };

  const onSubmit = handleSubmit(async ({ name }) => {
    const current = company.data;
    if (!current) return;
    const changes = { ...(name !== current.name ? { name } : {}), ...(logo !== current.logo ? { logo } : {}) };
    if (Object.keys(changes).length === 0) return;
    const outcome = await run(save(changes), { success: "Branding saved", setError, fields: ["name"] });
    if (!outcome.ok && outcome.error.fieldErrors.some((e) => e.field === "logo")) setLogoError(outcome.error.fieldErrors.find((e) => e.field === "logo")?.message);
  });

  const onCancel = () => {
    if (!company.data) return;
    reset({ name: company.data.name });
    setLogo(company.data.logo);
    setLogoError(undefined);
  };

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4" noValidate>
      <span className="h3">Company branding · Admin only</span>
      <QueryState query={company} isEmpty={false} empty={{ title: "" }} rows={2}>
        <FieldRow>
          <Field label="Company name" error={errors.name?.message}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={!!errors.name} {...register("name")} />}
          </Field>
          <div className="flex min-w-0 flex-col gap-[5px]">
            <span className="flabel">Logo</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => fileRef.current?.click()}>
                Upload logo
              </Button>
              <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg" className="sr-only" aria-label="Upload logo file" onChange={onLogo} />
              {logo ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setLogo("")}>
                  Use text wordmark
                </Button>
              ) : null}
              <span className="help">PNG or JPG, 200 KB or smaller. Without a logo, a text wordmark is used.</span>
            </div>
            {logoError ? (
              <span role="alert" className="errtxt">
                {logoError}
              </span>
            ) : null}
          </div>
        </FieldRow>
        <div className="flex max-w-[360px] items-center gap-2.5 rounded-[10px] bg-[#0F172A] p-3 text-white">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Logo preview" className="h-7 max-w-[120px] rounded bg-white object-contain" />
          ) : null}
          <span className="font-bold">{previewName}</span>
          <span className="help !text-[#94A3B8]">sidebar preview</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
            {isLoading ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </QueryState>
    </form>
  );
}
