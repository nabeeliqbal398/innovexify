"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldRow, Input } from "@/components/ui/form";
import { useAppDispatch, useData } from "@/hooks/useStore";
import { saveBranding } from "@/store/actions/people";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a company name (2–60 characters).").max(60, "Enter a company name (2–60 characters)."),
});
type Values = z.infer<typeof schema>;

const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_LOGO = 2 * 1024 * 1024;

export function BrandingForm() {
  const dispatch = useAppDispatch();
  const { company } = useData();
  const [logo, setLogo] = useState(company.logo);
  const [logoError, setLogoError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: { name: company.name } });
  const previewName = watch("name").trim() || "—";

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError("Logo must be a PNG, JPG or SVG file.");
      return;
    }
    if (file.size > MAX_LOGO) {
      setLogoError("Logo must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoError(undefined);
      setLogo(String(reader.result));
    };
    reader.onerror = () => setLogoError("Couldn't read that file.");
    reader.readAsDataURL(file);
  };

  const onSubmit = handleSubmit(({ name }) => {
    const res = dispatch(saveBranding(name, logo));
    if (!res.ok) setError("name", { message: res.error });
  });

  const onCancel = () => {
    reset({ name: company.name });
    setLogo(company.logo);
    setLogoError(undefined);
  };

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4" noValidate>
      <span className="h3">Company branding · Admin only</span>
      <FieldRow>
        <Field label="Company name" error={errors.name?.message}>
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} invalid={!!errors.name} {...register("name")} />
          )}
        </Field>
        <div className="flex min-w-0 flex-col gap-[5px]">
          <span className="flabel">Logo</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()}>
              Upload logo
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.svg"
              className="sr-only"
              aria-label="Upload logo file"
              onChange={onLogo}
            />
            {logo ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setLogo("")}>
                Use text wordmark
              </Button>
            ) : null}
            <span className="help">PNG, JPG or SVG. Without a verified logo, a text wordmark is used.</span>
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
        <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
          Save branding
        </Button>
      </div>
    </form>
  );
}
