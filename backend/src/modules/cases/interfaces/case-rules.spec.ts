import { CaseStage, type CaseStatus } from "@prisma/client";

import { classifyMove, EDITABLE_STATUSES, needsFilingNumber, nextStage, STAGE_LABEL, STAGE_ORDER, statusAfterMove } from "./case-rules";

/** The frontend STAGES list (constants/vocab.ts), written out by hand so a reordering of the enum fails here. */
const FRONTEND_STAGES = [
  "Invitation Sent",
  "Client Onboarding",
  "Information Required",
  "Documents Pending",
  "Documents Under Review",
  "Ready for Filing",
  "State Filing in Progress",
  "State Approval Received",
  "EIN Processing",
  "Post-Formation Documents",
  "Completed",
];

describe("case stage rules (ported from cases.ts)", () => {
  it("orders the stages exactly as the frontend does, taking the order from the enum", () => {
    expect(STAGE_ORDER.map((s) => STAGE_LABEL[s])).toEqual(FRONTEND_STAGES);
    expect(STAGE_ORDER).toEqual(Object.values(CaseStage));
  });

  describe("statusAfterMove", () => {
    it.each([
      [0, "AWAITING_CLIENT"],
      [3, "AWAITING_CLIENT"],
      [4, "ACTIVE"],
      [9, "ACTIVE"],
      [10, "COMPLETED"],
    ] as const)("stage index %i gives %s", (idx, expected) => {
      expect(statusAfterMove("ACTIVE", idx)).toBe(expected);
    });

    it("keeps On Hold and Blocked until the case completes", () => {
      for (const held of ["ON_HOLD", "BLOCKED"] as CaseStatus[]) {
        expect(statusAfterMove(held, 2)).toBe(held);
        expect(statusAfterMove(held, 6)).toBe(held);
        expect(statusAfterMove(held, 10)).toBe("COMPLETED");
      }
    });
  });

  describe("needsFilingNumber", () => {
    it("is required when moving past State Approval Received with nothing recorded", () => {
      expect(needsFilingNumber("STATE_APPROVAL_RECEIVED", "EIN_PROCESSING", "")).toBe(true);
    });
    it("is not required when a number is already on file", () => {
      expect(needsFilingNumber("STATE_APPROVAL_RECEIVED", "EIN_PROCESSING", "WY-DEMO-1")).toBe(false);
    });
    it("is not required for earlier stages, or for a case already past approval", () => {
      expect(needsFilingNumber("READY_FOR_FILING", "STATE_FILING_IN_PROGRESS", "")).toBe(false);
      expect(needsFilingNumber("STATE_FILING_IN_PROGRESS", "STATE_APPROVAL_RECEIVED", "")).toBe(false);
      expect(needsFilingNumber("EIN_PROCESSING", "POST_FORMATION_DOCUMENTS", "")).toBe(false);
    });
    it("treats a blank number as missing", () => {
      expect(needsFilingNumber("STATE_APPROVAL_RECEIVED", "EIN_PROCESSING", "   ")).toBe(true);
    });
  });

  describe("classifyMove", () => {
    it("allows exactly one step forward", () => {
      expect(classifyMove("INVITATION_SENT", "CLIENT_ONBOARDING")).toBe("next");
      expect(classifyMove("POST_FORMATION_DOCUMENTS", "COMPLETED")).toBe("next");
    });
    it("names a jump over a stage as a skip", () => {
      expect(classifyMove("INVITATION_SENT", "INFORMATION_REQUIRED")).toBe("skip");
      expect(classifyMove("READY_FOR_FILING", "COMPLETED")).toBe("skip");
    });
    it("names a move to an earlier stage as backward, and the same stage as same", () => {
      expect(classifyMove("EIN_PROCESSING", "STATE_APPROVAL_RECEIVED")).toBe("backward");
      expect(classifyMove("EIN_PROCESSING", "EIN_PROCESSING")).toBe("same");
    });
  });

  it("knows the next stage, and that there is none after Completed", () => {
    expect(nextStage("READY_FOR_FILING")).toBe("STATE_FILING_IN_PROGRESS");
    expect(nextStage("COMPLETED")).toBeNull();
  });

  it("does not let a status edit reach Completed", () => {
    expect(EDITABLE_STATUSES).not.toContain("COMPLETED");
  });
});
