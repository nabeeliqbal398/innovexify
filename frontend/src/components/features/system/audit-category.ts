/** Categories the audit log can be filtered by (the server's category names; "refused" is every refused attempt). */
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
  ["messages", "Messages"],
  ["announcements", "Announcements"],
  ["settings", "Settings"],
];

export function categoryLabel(cat: string | undefined): string {
  return AUDIT_CATS.find((c) => c[0] === cat)?.[1] ?? (cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "Other");
}
