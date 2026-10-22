import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { Role } from "@/types/domain";

interface MessageBubbleProps {
  text: ReactNode;
  who: string;
  role?: string;
  time: string;
  /** Sent by the signed-in user: right-aligned and filled with the brand color. */
  mine?: boolean;
  /** Sender's role. Client messages are white; staff messages are tinted. */
  senderRole?: Role;
  /** Extra detail after the time, such as an attachment note. */
  suffix?: string;
  /** Marks an internal note, shown with a warning tint. */
  internal?: boolean;
}

/** One message in a thread, with who wrote it, their role and when. */
export function MessageBubble({ text, who, role, time, mine, senderRole, suffix, internal }: MessageBubbleProps) {
  return (
    <div className={cn("flex flex-col gap-[3px]", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "bubble",
          mine
            ? "rounded-tr-[4px] bg-primary text-primary-foreground"
            : internal
              ? "rounded-tl-[4px] border border-dashed border-[#FCD34D] bg-warning-soft text-[#78350F] dark:border-warning/40 dark:text-warning"
              : senderRole === "CLIENT"
                ? "rounded-tl-[4px] border border-border bg-surface"
                : "rounded-tl-[4px] border border-[#C7D2FE] bg-primary-soft dark:border-primary/40",
        )}
      >
        {text}
      </div>
      <span className="help">
        {who}
        {role ? ` · ${role}` : ""} · {time}
        {suffix ?? ""}
      </span>
    </div>
  );
}
