import type { HTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/* ------------------------------- layout ------------------------------ */

export function Card({ className, ...props }: HTMLAttributes<HTMLElement> & { as?: "section" | "div" }) {
  return <section className={cn("card overflow-hidden", className)} {...props} />;
}

export function CardHeader({ title, aside, children }: { title?: ReactNode; aside?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-h">
      {title ? <span className="h3 flex-1">{title}</span> : null}
      {children}
      {aside}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {description ? <p className="help">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, text, children }: { title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty-s">
      <strong>{title}</strong>
      {text ? <span className="help">{text}</span> : null}
      {children}
    </div>
  );
}

/* ------------------------------ callouts ----------------------------- */

const callouts = {
  lock: "border border-dashed border-[#FCD34D] bg-warning-soft text-[#78350F] dark:border-warning/40 dark:text-warning",
  info: "border border-[#BFDBFE] bg-info-soft text-[#1E3A8A] dark:border-info/40 dark:text-info",
  warn: "border border-[#FECACA] bg-danger-soft text-[#991B1B] dark:border-danger/40 dark:text-danger",
  ok: "border border-[#BBF7D0] bg-success-soft text-[#166534] dark:border-success/40 dark:text-success",
} as const;

export function Callout({
  tone,
  icon,
  className,
  children,
  role,
}: {
  tone: keyof typeof callouts;
  icon?: IconName;
  className?: string;
  children: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={cn("flex items-start gap-2 rounded-lg px-[11px] py-[9px] text-sm", callouts[tone], className)}>
      {icon ? <Icon name={icon} small className="mt-0.5" /> : null}
      <span className="flex-1">{children}</span>
    </div>
  );
}

/* ------------------------------ controls ----------------------------- */

export function Chip({
  active,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & { active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-[5px] rounded-full border px-2.5 text-xs font-medium",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface text-neutral hover:bg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Count({ children }: { children: ReactNode }) {
  return <span className="font-semibold tabular-nums opacity-80">{children}</span>;
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Segmented control for switching between a few views of the same data. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  tabs,
}: {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Use tab semantics when the control switches panels. */
  tabs?: boolean;
}) {
  return (
    <div role={tabs ? "tablist" : "group"} aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-muted p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role={tabs ? "tab" : undefined}
          aria-selected={tabs ? o.value === value : undefined}
          aria-pressed={tabs ? undefined : o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 cursor-pointer rounded-[7px] border-0 px-2.5 text-sm font-medium",
            o.value === value ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(15,23,42,.12)]" : "bg-transparent text-neutral",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-0.5 overflow-x-auto border-b border-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "-mb-px h-[38px] cursor-pointer whitespace-nowrap border-b-2 px-3 font-medium",
            o.value === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ displays ----------------------------- */

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-[30px] flex-none items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-soft-foreground",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function Progress({ value, label, className }: { value: number; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={label ? pct : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      className={cn("h-1.5 min-w-[60px] overflow-hidden rounded-full bg-border", className)}
    >
      <span className="block h-full rounded-full bg-primary transition-[width] duration-[400ms]" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Facts({ items }: { items: ReadonlyArray<{ label: string; value: ReactNode; mono?: boolean }> }) {
  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-[18px] gap-y-3">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="help">{i.label}</dt>
          <dd className={cn("mt-0.5 text-sm font-medium [overflow-wrap:anywhere]", i.mono && "mono")}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface TimelineItem {
  id: string | number;
  dotClass?: string;
  content: ReactNode;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {items.map((it, i) => (
        <li key={it.id} className="relative grid grid-cols-[14px_1fr] gap-2.5 py-2">
          {i < items.length - 1 ? <span aria-hidden="true" className="absolute bottom-[-8px] left-1.5 top-[22px] w-0.5 bg-border" /> : null}
          <span className={cn("mt-1 size-3 rounded-full bg-border-strong", it.dotClass)} />
          <div>{it.content}</div>
        </li>
      ))}
    </ol>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skel", className)} aria-hidden="true" />;
}

/** Horizontal bar row used by stage distributions and workload lists. */
export function HBar({
  label,
  value,
  max,
  display,
  onClick,
  ariaLabel,
}: {
  label: ReactNode;
  value: number;
  max: number;
  display?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const body = (
    <>
      <span>{label}</span>
      <span className="block h-2.5 overflow-hidden rounded-full bg-primary-soft">
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-[400ms]"
          style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }}
        />
      </span>
      <span className="text-right tabular-nums text-neutral">{display ?? value}</span>
    </>
  );
  const cls = "grid w-full grid-cols-[minmax(90px,190px)_1fr_34px] items-center gap-2.5 rounded-md px-0 py-[3px] text-left text-sm";
  return onClick ? (
    <button type="button" aria-label={ariaLabel} onClick={onClick} className={cn(cls, "cursor-pointer hover:bg-background")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function VBars({
  data,
  label,
  alt,
  height = 140,
}: {
  data: ReadonlyArray<{ label: string; n: number }>;
  label: string;
  alt?: boolean;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div role="img" aria-label={label} className="flex items-end gap-2 pt-2" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] font-semibold text-neutral">{d.n}</span>
          <span
            className={cn("w-full max-w-[38px] rounded-t-md rounded-b-sm transition-[height] duration-[400ms]", alt ? "bg-[#0EA5E9]" : "bg-[#6366F1]")}
            style={{ height: `${Math.round((d.n / max) * 70)}%`, minHeight: d.n ? 4 : 0 }}
          />
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
