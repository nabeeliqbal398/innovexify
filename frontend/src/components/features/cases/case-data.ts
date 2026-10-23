import { isDone as caseIsDone, type TimelineEntry as Entry } from "@/lib/api-mappers";
import type { Role } from "@/types/domain";

export type TimelineEntry = Entry;
export const isDone = caseIsDone;

/** Admin and Manager open cases from Case management; CSR and Compliance open them from Clients. */
export function caseViewFor(role: Role): "cases" | "clients" {
  return role === "ADMIN" || role === "MANAGER" ? "cases" : "clients";
}
