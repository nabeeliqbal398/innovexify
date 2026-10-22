import type { AuditEntry } from "@/types/domain";

export const AUDIT_CATS: ReadonlyArray<readonly [string, string]> = [
  ["all", "All"],
  ["refused", "Refused attempts"],
  ["users", "Users & roles"],
  ["invites", "Invitations"],
  ["auth", "Sign-in"],
  ["docs", "Documents"],
  ["cases", "Cases & tasks"],
  ["tickets", "Tickets"],
  ["reports", "CSR reports"],
  ["settings", "Settings"],
];

/** Category of an audit entry: the recorded one, else inferred from the action text. */
export function catOfEntry(a: AuditEntry): string {
  if (a.cat && a.cat !== "other") return a.cat;
  const t = (a.action || "").toLowerCase();
  if (/signed in|sign-in|session/.test(t)) return "auth";
  if (/invit|accepted/.test(t)) return "invites";
  if (/email|suspend|reactivat|remove|role|profile/.test(t)) return "users";
  if (/document|upload|download|preview|approved|rejected|requested|shared/.test(t)) return "docs";
  if (/tkt-|ticket/.test(t)) return "tickets";
  if (/prj-|case|stage|task|assign|filing|follow-up|note/.test(t)) return "cases";
  if (/rpt-|report/.test(t)) return "reports";
  if (/brand|prefix|template|trigger|service/.test(t)) return "settings";
  return a.cat || "other";
}

export function categoryLabel(cat: string): string {
  return AUDIT_CATS.find((c) => c[0] === cat)?.[1] ?? "Other";
}
