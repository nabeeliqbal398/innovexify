# Audit module

## Purpose
Reading and exporting the audit log. Writing is `common/audit/AuditService`, called by every module on the same transaction as the
action it records.

## Access
`auditLog` in the permission table: **Admin only**. Manager, CSR, Compliance and clients get 403. (The Phase 4 brief said "Admin and
Manager"; the permission table the frontend ships says Admin only, so the table wins. To change it, change `PERMS.auditLog` in one place.)

## Endpoints
Base `/api/v1`. Two routes, both GET.

| Route | Request | Response |
| --- | --- | --- |
| `/audit` | `?actorId&category&ok&from&to&search&sort&order&page&limit` | page of `{ id, at, actor, actorRole, action, target, ok, category, requestId, ipAddress }`, newest first |
| `/audit/export` | the same filters | CSV file, newest first |

- **Filters:** `category=refused` means "refused attempts" (`ok = false`, whatever their subject); `ok=false` does the same; `from` and `to` are
  UTC dates, `to` included; `search` matches action, target and the actor's name (case-insensitive, up to 100 characters). Bad values are 422 with a message on the field.
- **Export:** at most **50,000 rows** (the newest when more match), read in batches of 1,000 with keyset paging so memory stays flat, streamed.
  Headers: `text/csv; charset=utf-8`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`,
  `X-Rows-Matched`, `X-Rows-Exported`, `X-Export-Truncated`. Only entries up to the moment of the request are included. The export is itself
  audited (`Exported the audit log (n rows)`, category `settings`).
- **Spreadsheet formulas:** a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a value such as
  `=HYPERLINK(...)` typed into a client's name shows as text when an Admin opens the file (`interfaces/csv.ts`; unit-tested). Cells with commas,
  quotes or newlines are quoted, and the file starts with a UTF-8 byte order mark so Excel reads accents.

## No modification
The audit log is append-only from the API: there is no create, update or delete route and the repository has no write method. A test
tries POST, PUT, PATCH and DELETE on every audit path and expects 404 or 405.

## Retention
Manual for now: entries are kept until someone with database access removes them. A scheduled archive (for example, export entries
older than 24 months to cold storage, then delete) is future work and needs a decision on how long the business must keep them.

## Tests
`test/audit.e2e-spec.ts`; unit `interfaces/csv.spec.ts`.
