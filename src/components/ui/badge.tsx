import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium leading-none before:size-1.5 before:rounded-full before:bg-current before:content-['']",
  {
    variants: {
      tone: {
        ok: "bg-success-soft text-success",
        info: "bg-info-soft text-info",
        warn: "bg-warning-soft text-warning",
        err: "bg-danger-soft text-danger-hover",
        q: "bg-neutral-soft text-neutral",
        brand: "bg-primary-soft text-primary-soft-foreground",
        violet: "bg-violet-soft text-violet",
        dark: "bg-border text-foreground",
        teal: "bg-teal-soft text-teal",
      },
    },
    defaultVariants: { tone: "q" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Smaller badge for inline use next to a name. */
  compact?: boolean;
}

export function Badge({ tone, compact, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), compact && "h-[18px]", className)} {...props} />;
}
