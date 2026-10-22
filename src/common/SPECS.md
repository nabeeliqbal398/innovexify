# Shared infrastructure (`src/common`)

Everything the feature modules share. Global modules, so a module just injects what it needs.

## CounterService (`counter/`)
`next(key, tx)` runs `UPDATE "Counter" SET value = value + 1, "updatedAt" = now() WHERE key = $1 RETURNING value` inside the
caller's transaction. Keys: `case` (PRJ-n), `client` (CASE-year-NNNN), `ticket`, `report`, `filing`. Each counter holds the
last number issued. The row lock serialises concurrent callers until they commit, and a rolled-back transaction gives its
number back (no gaps from failures). Take counters in a fixed order to avoid deadlocks. A missing row is created on first use.

## MailService (`mail/`)
Abstract class (the injection token) with `send(message)`. `LogMailService` logs the email and sends nothing. **SMTP (or a
provider API) can replace it later** by swapping the provider in `MailModule`; no caller changes. `send` must reject when
the message could not be handed over: invitations rely on that to roll their transaction back. Templates are in
`templates.ts` (invitation, email changed, notification).

## Pagination (`pagination/`)
`PaginationQueryDto`: `page >= 1` (default 1), `1 <= limit <= 100` (default 20), `sort`, `order`. Invalid values are
rejected with a field-level `422` (`page must be 1 or greater.`, `limit can't be more than 100. Ask for a smaller page.`),
never clamped. `paginate(query, load, map?)` returns a `PaginatedResponse` (the envelope's `meta` is built from the query).
`parseSort(query, allowedFields, default)` rejects an unknown sort field and lists the allowed ones; a named `sort` with no
`order` means ascending.

## Data scoping (`scope/`)
`clientScope(actor)` and `caseScope(actor)` return the Prisma `where` fragment that every list and every get-by-id ANDs in:
Admin/Manager everything, Compliance every client and case, CSR only assigned clients and their cases, Client only their own.
Outside the scope is a 404, never a 403. Soft-deleted rows are hidden except to Admin and Manager (`includeRemoved`). An
unknown role matches nothing. What Compliance may *not* see (for example follow-ups) is decided by the permission table in
the module that serves that data.

## Permissions (`permissions/`)
`@RequirePermission(perm)` on the route is the coarse gate (the global `PermissionsGuard`). `AccessService.assert(actor,
perm, resource)` does the same `can()` check once a service has loaded the record, writes the refusal to the audit log and
throws with the rule's own text. Added to the table: `rollbackStage` (Admin, Manager), and `can('complianceMilestones')` also
looks at the stage the case is in now (`current`).

## NotificationService (`notifications/`)
`notify(tx, { userIds, text, link, category?, excludeUserId? })` writes in-app notifications inside the caller's
transaction, honouring each user's `NotificationPreference` for the category (both on by default), and returns who also
wants an email. Without a category it is a system message (in-app only). `emailAfterCommit` sends those emails, logging
failures instead of throwing.

## Audit (`audit/`)
`AuditService.record(entry, tx?)`: pass the transaction client to make the entry commit or roll back with the change.

## Validation errors (`pipes/`)
One entry per field. When several rules fail on one field the most basic one is reported (required, then type, then
format, then length), not the one that happened to run first.

## Errors (`constants/error-codes.ts`, `exceptions/`)
Every rule has its own `errorCode` and a message written for the person using the app. `CONCURRENT_MODIFICATION` replaces the
unused `VERSION_CONFLICT`.
