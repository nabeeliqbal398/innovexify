import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 no-underline",
  {
    variants: {
      variant: {
        default:
          "border-border bg-surface text-foreground hover:border-border-strong hover:bg-background hover:text-foreground",
        primary:
          "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover hover:text-primary-foreground",
        ok: "border-success bg-success text-surface hover:opacity-90",
        bad: "border-border bg-surface text-danger-hover hover:border-danger/30 hover:bg-danger-soft hover:text-danger-hover",
        danger:
          "border-danger bg-danger text-primary-foreground hover:border-danger-hover hover:bg-danger-hover hover:text-primary-foreground",
        ghost: "border-transparent bg-transparent text-foreground hover:border-transparent hover:bg-muted",
        /** A control the signed-in role can't use. It stays clickable so it can explain the rule. */
        locked:
          "border-dashed border-border bg-background text-muted-foreground hover:bg-muted hover:text-neutral",
      },
      size: {
        default: "h-[34px] px-3",
        sm: "h-7 px-[9px] text-sm",
        icon: "h-[34px] w-[38px] px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
