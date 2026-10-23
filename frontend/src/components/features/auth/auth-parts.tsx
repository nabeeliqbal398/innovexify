"use client";

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { PASSWORD_RULES } from "@/lib/validators";

/** Auth inputs are slightly taller than workspace inputs. */
export const authInput =
  "h-[42px] w-full rounded-md border border-border-strong bg-surface px-3 text-foreground placeholder:text-muted-foreground";

export const authButton =
  "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border px-4 font-medium no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const authPrimary = `${authButton} border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover hover:text-primary-foreground`;
export const authSecondary = `${authButton} border-border bg-surface text-foreground hover:border-border-strong hover:bg-background hover:text-foreground`;

export function AuthField({
  id,
  label,
  error,
  aside,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <span id={`${id}-err`} role="alert" className="errtxt">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function PasswordInput({ invalid, className, id, ...props }, ref) {
    const [shown, setShown] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={shown ? "text" : "password"}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : undefined}
          className={cn(authInput, "pr-11", invalid && "border-danger", className)}
          {...props}
        />
        <button
          type="button"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          className="absolute right-1 top-1 flex size-[34px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <Icon name={shown ? "eyeOff" : "eye"} />
        </button>
      </div>
    );
  },
);

const ALERTS = {
  err: "border-[#FECACA] bg-danger-soft text-[#7F1D1D] dark:border-danger/40 dark:text-danger",
  warn: "border-[#FDE68A] bg-warning-soft text-[#78350F] dark:border-warning/40 dark:text-warning",
  ok: "border-[#BBF7D0] bg-success-soft text-[#14532D] dark:border-success/40 dark:text-success",
  info: "border-[#BFDBFE] bg-info-soft text-[#1E3A8A] dark:border-info/40 dark:text-info",
} as const;

export function AuthAlert({
  tone,
  icon,
  role,
  children,
}: {
  tone: keyof typeof ALERTS;
  icon: "alert" | "check" | "lock" | "mail";
  role?: "alert" | "status";
  children: ReactNode;
}) {
  return (
    <div role={role} className={cn("flex gap-2.5 rounded-[10px] border px-3.5 py-3 text-sm", ALERTS[tone])}>
      <Icon name={icon} small className="mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

const BADGE_TONES = {
  brand: "bg-primary-soft text-primary-soft-foreground",
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  err: "bg-danger-soft text-danger-hover",
} as const;

export function AuthIcon({ tone, name }: { tone: keyof typeof BADGE_TONES; name: "shield" | "check" | "clock" | "user" | "alert" }) {
  return (
    <span className={cn("inline-flex size-11 items-center justify-center rounded-xl", BADGE_TONES[tone])}>
      <Icon name={name} />
    </span>
  );
}

export function AuthHeading({ title, text }: { title: string; text?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {text ? <p className="text-sm text-muted-foreground">{text}</p> : null}
    </div>
  );
}

/** Live checklist of the password rules. A met rule turns green and swaps its dot for a check. */
export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Password requirements">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.label} className={cn("flex items-center gap-1.5 text-sm", ok ? "text-success" : "text-muted-foreground")}>
            <Icon name={ok ? "check" : "dot"} small />
            {r.label}
            <span className="sr-only">{ok ? " (met)" : " (not met yet)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
