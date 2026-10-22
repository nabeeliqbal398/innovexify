# Search module

## Purpose
Global search over what the caller may see. `GET /api/v1/search?q=...` (any signed-in user).

## Input
`q` is trimmed, then must be **2 to 100 characters** (422 with a message on `q`). `%` and `_` are escaped, so they match themselves rather than acting as
wildcards (`interfaces/like.ts`, used with `ILIKE ... ESCAPE '\'`); the pattern is always a bound parameter, never pasted into SQL.
**Throttled** to `SEARCH_RATE_LIMIT_PER_MIN` (default 60) per person; over it is 429 with the seconds to wait.

## Response
`{ query, groups: [{ key, label, items: [{ title, meta, target: { view, id?, query? } }] }] }`, at most **5 items per kind**, groups left out when empty.
`target` names the screen and what it opens with, the same names the navigation uses.
- **Staff:** `clients` (name, email, case ID, business name), `cases` (`PRJ-n`, case ID, client, business, stage), `tasks` (title; **Admin and Manager only**),
  `tickets` (`TKT-n`, title, client), `messages` (conversation text).
- **Client:** their own `cases`, `tickets`, `messages` and `documents` (names only).
- Never searched: document files and their contents, internal ticket notes, CSR reports.

## Scoping
Every query carries the caller's scope (`clientIdInScope`, `caseInScope`, `taskInScope` in `common/scope/scope-sql.ts`), the SQL twins of the list endpoints'
scopes, so a CSR finds only their own clients' records and nothing of another CSR's, Compliance every client's, a client only their own. Removed clients
and their records are left out. Staff do not search documents (the screen doesn't either).

## Deviations from the brief (for confirmation)
The brief's staff list also named documents for roles with `docsAccess`; the screen's search excludes document files, so documents are searched only for a client's own.

## Tests
`test/search.e2e-spec.ts`: input rules, shape, case-insensitive and ID matching, scoping per role (a CSR searching another CSR's client, case, ticket and message finds nothing),
internal notes never searched, wildcard escaping, SQL-looking input, the 5-per-kind cap, and the rate limit.
