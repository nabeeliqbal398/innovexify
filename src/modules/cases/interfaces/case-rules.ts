import { CaseStage, type CaseStatus } from "@prisma/client";

/**
 * The stage rules, ported from frontend/src/store/actions/cases.ts. Pure functions: no database, no clock.
 * Stage order is the order of the CaseStage enum in the Prisma schema (which is the order of the frontend STAGES list).
 */
export const STAGE_ORDER: readonly CaseStage[] = Object.values(CaseStage);

export const STAGE_LABEL: Record<CaseStage, string> = {
  INVITATION_SENT: "Invitation Sent",
  CLIENT_ONBOARDING: "Client Onboarding",
  INFORMATION_REQUIRED: "Information Required",
  DOCUMENTS_PENDING: "Documents Pending",
  DOCUMENTS_UNDER_REVIEW: "Documents Under Review",
  READY_FOR_FILING: "Ready for Filing",
  STATE_FILING_IN_PROGRESS: "State Filing in Progress",
  STATE_APPROVAL_RECEIVED: "State Approval Received",
  EIN_PROCESSING: "EIN Processing",
  POST_FORMATION_DOCUMENTS: "Post-Formation Documents",
  COMPLETED: "Completed",
};

export const stageIndex = (stage: CaseStage): number => STAGE_ORDER.indexOf(stage);

/** Index of State Approval Received: moving past it needs the state's confirmation number. */
const STATE_APPROVAL_IDX = stageIndex(CaseStage.STATE_APPROVAL_RECEIVED);
const LAST_IDX = STAGE_ORDER.length - 1;

/** Status a case takes after moving to a stage, unless it is on hold or blocked (cases.ts statusAfterMove). */
export function statusAfterMove(previous: CaseStatus, targetIdx: number): CaseStatus {
  if (targetIdx >= LAST_IDX) return "COMPLETED";
  if (previous === "ON_HOLD" || previous === "BLOCKED") return previous;
  return targetIdx <= stageIndex(CaseStage.DOCUMENTS_PENDING) ? "AWAITING_CLIENT" : "ACTIVE";
}

/** Moving past state approval needs the state's own confirmation number, unless one is already recorded (cases.ts needsFilingNumber). */
export function needsFilingNumber(current: CaseStage, target: CaseStage, recorded: string): boolean {
  return stageIndex(target) > STATE_APPROVAL_IDX && stageIndex(current) <= STATE_APPROVAL_IDX && !recorded.trim();
}

export type MoveKind = "same" | "next" | "skip" | "backward";

/** A case moves one stage forward at a time. Anything else is named here so the caller can explain it. */
export function classifyMove(current: CaseStage, target: CaseStage): MoveKind {
  const from = stageIndex(current);
  const to = stageIndex(target);
  if (to === from) return "same";
  if (to < from) return "backward";
  return to === from + 1 ? "next" : "skip";
}

export const isLastStage = (stage: CaseStage): boolean => stage === STAGE_ORDER[LAST_IDX];

export function nextStage(stage: CaseStage): CaseStage | null {
  return STAGE_ORDER[stageIndex(stage) + 1] ?? null;
}

/** What a manager may set by hand. Completed is reached only by moving the stage; the rest follows the stage. */
export const EDITABLE_STATUSES: readonly CaseStatus[] = ["ACTIVE", "AWAITING_CLIENT", "BLOCKED", "ON_HOLD"];

export const STATUS_LABEL: Record<CaseStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  AWAITING_CLIENT: "Awaiting Client",
  UNDER_REVIEW: "Under Review",
  FILING_IN_PROGRESS: "Filing in Progress",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
  ACTIVE: "Active",
  BLOCKED: "Blocked",
};

export const PRIORITY_LABEL = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" } as const;
