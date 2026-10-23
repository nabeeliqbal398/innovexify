/**
 * Turns what the user typed into a LIKE pattern that means "contains this text". `%` and `_` are wildcards in LIKE, and the
 * backslash is the escape character, so each is escaped: searching for "100%" finds "100%", not everything that starts with
 * "100", and searching for "_" does not match every one-character string. Pair it with `ESCAPE '\'` in the query.
 */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, "\\$&");

export const containsPattern = (text: string): string => `%${escapeLike(text)}%`;
