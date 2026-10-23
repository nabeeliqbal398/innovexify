import type { BadgeTone } from "@/constants/vocab";
import type { ReportStatus } from "@/types/domain";

export const REPORT_TONE: Record<ReportStatus, BadgeTone> = {
  Submitted: "brand",
  Acknowledged: "info",
  "Clarification requested": "warn",
  Reviewed: "ok",
};

/** The stored status "Reviewed" reads as "Resolved" everywhere the user sees it. */
export function reportLabel(status: string): string {
  return status === "Reviewed" ? "Resolved" : status;
}
