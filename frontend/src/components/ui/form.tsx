import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-border-strong bg-surface px-2.5 text-foreground placeholder:text-muted-foreground read-only:bg-background read-only:text-neutral disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

export interface ControlProps {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & ControlProps>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(control, "h-[34px]", invalid && "border-danger", className)}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & ControlProps>(
  function Select({ className, invalid, ...props }, ref) {
    return (
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(control, "h-[34px]", invalid && "border-danger", className)}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(control, "min-h-16 resize-y py-2", invalid && "border-danger", className)}
        {...props}
      />
    );
  },
);

interface FieldProps {
  label: ReactNode;
  /** Receives the generated id so the label and control are linked. */
  children: (id: string, describedBy?: string) => ReactNode;
  help?: ReactNode;
  error?: string;
  className?: string;
}

/** A labelled control with optional help text and a field-level error message. */
export function Field({ label, children, help, error, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : help ? `${id}-help` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-[5px]", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id, describedBy)}
      {error ? (
        <span id={`${id}-err`} role="alert" className="errtxt">
          {error}
        </span>
      ) : help ? (
        <span id={`${id}-help`} className="help">
          {help}
        </span>
      ) : null}
    </div>
  );
}

/** Row of fields that wrap on narrow screens. */
export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-end gap-3 [&>*]:min-w-[180px] [&>*]:flex-1", className)}>{children}</div>;
}
