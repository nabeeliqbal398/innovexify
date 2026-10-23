"use client";

import type { ChangeEvent, ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface FileButtonProps {
  children: ReactNode;
  ariaLabel: string;
  accept?: string;
  variant?: "primary" | "ghost";
  icon?: IconName;
  onFile: (file: File | null) => void;
}

/** A button-styled label that wraps a visually hidden file input, so it stays keyboard reachable. */
export function FileButton({ children, ariaLabel, accept, variant = "primary", icon, onFile }: FileButtonProps) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    onFile(file);
  };
  return (
    <label className={cn(buttonVariants({ variant, size: "sm" }), "cursor-pointer focus-within:ring-2 focus-within:ring-ring")}>
      {icon ? <Icon name={icon} small /> : null}
      {children}
      <input type="file" accept={accept} onChange={handle} aria-label={ariaLabel} className="sr-only" />
    </label>
  );
}

export const FILE_ACCEPT = ".png,.jpg,.jpeg,.pdf,.docx";
