import type { FilingStatus } from "@prisma/client";

/**
 * The filing tracker's rules, ported from frontend/src/store/actions/cases.ts (saveFiling) and the filing dialog.
 * Pure functions: no database, no clock (the caller passes today).
 */

export const FILING_LABEL: Record<FilingStatus, string> = {
  NOT_SUBMITTED: "Not submitted",
  SUBMITTED: "Submitted",
  PENDING_STATE_REVIEW: "Pending state review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** Statuses that only make sense once the filing has gone to the state, so they need the submission date. */
export const NEEDS_SUBMISSION_DATE: readonly FilingStatus[] = ["SUBMITTED", "PENDING_STATE_REVIEW", "APPROVED", "REJECTED"];

/**
 * How far along a filing is. Approved and Rejected are two different endings at the same point, so moving between
 * them is not "forward".
 */
const RANK: Record<FilingStatus, number> = { NOT_SUBMITTED: 0, SUBMITTED: 1, PENDING_STATE_REVIEW: 2, APPROVED: 3, REJECTED: 3 };

export type FilingMove = "same" | "forward" | "backward";

export function classifyFilingMove(from: FilingStatus, to: FilingStatus): FilingMove {
  if (from === to) return "same";
  return RANK[to] > RANK[from] ? "forward" : "backward";
}

/** An approved or rejected filing records that outcome (the prototype: outcome = status for those two, empty otherwise). */
export function outcomeFor(status: FilingStatus, typed: string): string {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return typed;
}

/** A filing is late when its next action date has passed and it isn't approved (the tracker's "late" marker). */
export function isLate(nextActionDate: Date | null, status: FilingStatus, today: Date): boolean {
  return nextActionDate !== null && nextActionDate.getTime() < today.getTime() && status !== "APPROVED";
}
