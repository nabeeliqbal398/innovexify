/**
 * Ported exactly from the prototype (store/actions/cases.ts, findDuplicateDocument): a title that only repeats an
 * open document request is a duplicate. Titles are normalised (lower-cased, bracketed text and punctuation dropped,
 * filler words like "upload", "the", "copy of" removed) and compared by containment, either way round.
 */
export function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(upload|send|provide|submit|get|collect|request|the|a|an|new|updated|copy|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first open request whose name matches `title`, or null. `openRequests` are the client's REQUESTED, REJECTED and INFO documents. */
export function findDuplicateRequest<T extends { name: string }>(title: string, openRequests: readonly T[]): T | null {
  const t = normalizeTitle(title);
  if (t.length < 4) return null;
  return (
    openRequests.find((d) => {
      const k = normalizeTitle(d.name);
      return k.length >= 4 && (t.includes(k) || k.includes(t));
    }) ?? null
  );
}
