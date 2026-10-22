/**
 * Field names that must never appear in an API response, at any depth. Every e2e response is scanned for them (see the
 * middleware in createApp), so a new endpoint that returns a whole database row fails the suite instead of leaking a hash.
 * `refreshToken` is allowed only while ALLOW_BODY_REFRESH is on, which is the documented exception for non-browser clients.
 */
export const FORBIDDEN_FIELDS = ["passwordHash", "tokenHash", "storageKey", "attachmentKey", "refreshToken"] as const;

export interface Finding {
  path: string;
  field: string;
}

export function findForbiddenFields(body: unknown, allowRefreshToken: boolean, path = "$"): Finding[] {
  if (body === null || typeof body !== "object") return [];
  if (Array.isArray(body)) return body.flatMap((item, i) => findForbiddenFields(item, allowRefreshToken, `${path}[${i}]`));
  const found: Finding[] = [];
  for (const [key, value] of Object.entries(body)) {
    if ((FORBIDDEN_FIELDS as readonly string[]).includes(key) && !(key === "refreshToken" && allowRefreshToken)) found.push({ path: `${path}.${key}`, field: key });
    found.push(...findForbiddenFields(value, allowRefreshToken, `${path}.${key}`));
  }
  return found;
}

/** Violations seen by the response hook during the current test; the setup file fails the test if any are recorded. */
export const violations: Array<Finding & { url: string }> = [];
