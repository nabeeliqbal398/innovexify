"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Wider layout for forms with several columns. */
  wide?: boolean;
  /** Leading visual, such as the lock badge on a refusal. */
  icon?: ReactNode;
  children: ReactNode;
  /** Role "alertdialog" semantics for refusals; the dialog then needs an explicit close. */
  alert?: boolean;
}

/** Centered modal. Focus is trapped and returned to the trigger, and Escape closes it. */
export function Modal({ open, onOpenChange, title, description, wide, icon, children, alert }: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-foreground/40 p-4">
          <DialogPrimitive.Content
            role={alert ? "alertdialog" : "dialog"}
            aria-describedby={description ? undefined : undefined}
            className={cn(
              "flex max-h-[calc(100vh-32px)] w-[min(500px,100%)] animate-pop flex-col gap-3.5 overflow-auto rounded-xl bg-surface p-5 shadow-dialog",
              wide && "w-[min(640px,100%)]",
            )}
          >
            <div className="flex items-start gap-2.5">
              {icon}
              <div className="flex flex-1 flex-col gap-1 self-center">
                <DialogPrimitive.Title className="text-xl font-semibold">{title}</DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="help">{description}</DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close
                aria-label="Close dialog"
                className="flex size-8 flex-none items-center justify-center rounded-md text-neutral hover:bg-muted hover:text-foreground"
              >
                <Icon name="x" small />
              </DialogPrimitive.Close>
            </div>
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** Right-hand detail panel for tasks, staff and services. */
export function Drawer({ open, onOpenChange, title, subtitle, children }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[45] flex animate-fade justify-end bg-foreground/30">
          <DialogPrimitive.Content className="flex h-full w-[min(460px,100%)] animate-slide flex-col bg-surface shadow-drawer outline-none">
            <div className="flex items-start gap-2.5 border-b border-border p-4 pb-3">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-xl font-semibold">{title}</DialogPrimitive.Title>
                {subtitle ? (
                  <DialogPrimitive.Description className="help">{subtitle}</DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close
                aria-label="Close panel"
                className="flex size-8 flex-none items-center justify-center rounded-md text-neutral hover:bg-muted hover:text-foreground"
              >
                <Icon name="x" small />
              </DialogPrimitive.Close>
            </div>
            <div className="flex flex-1 flex-col gap-3.5 overflow-auto p-4">{children}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
