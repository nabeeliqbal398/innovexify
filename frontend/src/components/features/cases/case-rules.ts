import { STAGES } from "@/constants/vocab";
import type { Project } from "@/types/domain";

/**
 * Hints that save a round trip. The server applies the same rules and is the authority: it refuses a stage that is not the
 * next one, a missing confirmation number and a rollback without a reason.
 */

/** Moving past state approval needs the state's own confirmation number, unless one is already recorded. */
export function needsFilingNumber(project: Pick<Project, "stageIdx" | "filing">, target: string): boolean {
  const idx = STAGES.indexOf(target as (typeof STAGES)[number]);
  return idx > 7 && project.stageIdx <= 7 && !project.filing;
}

/** Moving to an earlier stage is a rollback, and needs a reason. */
export function isRollback(project: Pick<Project, "stageIdx">, target: string): boolean {
  const idx = STAGES.indexOf(target as (typeof STAGES)[number]);
  return idx >= 0 && idx < project.stageIdx;
}
