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

## File storage and uploads (`storage/`)

Used by the documents module; written so other modules (message attachments, branding logo) can reuse it.

**Layers**
- `StorageService` (abstract) with `put(key, bytes)`, `open(key)` (stream plus size) and `remove(key)`. `LocalDiskStorage` is the
  implementation today. Services never touch a path or a bucket.
- `VirusScanner` (abstract): called on every file after the content checks and before anything is stored. `NoopScanner` accepts
  everything and is **not a security control**, only the place the real scan goes. A scanner that throws makes the upload fail
  (nothing is accepted unscanned).
- `UploadService.store(file, record)`: check, scan, store under a random key, run `record` (the database write), and delete the
  stored file if `record` fails. `check(file)` runs the rules without storing.
- `UploadErrorsInterceptor`: turns multer's generic 413/400 into `FILE_TOO_LARGE` / `FILE_REQUIRED`.
- `file-policy.ts`: the rules, as pure functions (unit-tested): `inspectUpload`, `sanitizeFileName`, `sniffKind`,
  `attachmentDisposition`.

**Where files live.** `STORAGE_DIR` (default `./storage`), created at startup with mode 0700. Never inside a served folder:
nothing in the API serves it statically, and there is no directory listing. Files are written to
`<STORAGE_DIR>/<first two characters of the key>/<key>`, with the key a random UUID. The original name is never used on disk.
`pathOf` accepts only a key that is exactly a UUID and checks the resolved path is inside the root, so `../`, absolute paths,
separators and anything else are refused before a path is built. `put` writes a temporary file then hard-links it into place,
so a reader never sees half a file and an existing key can never be overwritten. In Docker, mount a volume on `/app/storage`
(`docker-compose.prod.yml` does) and back it up with the database.

**Swapping to S3.** Implement `StorageService` (`put` -> PutObject, `open` -> GetObject stream with ContentLength, `remove` ->
DeleteObject) and change the `useClass` in `StorageModule`. Keep the bucket private: downloads still go through the API, which
does the permission check, the audit entry and sets the headers.

**What is accepted** (decided on content, never on the browser's claimed type):
- Extensions `pdf`, `png`, `jpg`, `jpeg`, `docx`; maximum size `MAX_UPLOAD_MB` (default 25, range 1-100; a file of exactly that
  size is accepted, one byte more is not).
- The first bytes must be that type's signature: `%PDF-`, the PNG header, `FF D8 FF`, or a ZIP holding `[Content_Types].xml` and a
  `word/` folder (a bare ZIP renamed `.docx` is refused). The detected type becomes the stored `mimeType` and the download's
  `Content-Type`.
- Checked in this order, each with its own code and message: empty (`FILE_EMPTY`), too large (`FILE_TOO_LARGE`), no usable name
  (`FILE_NAME_INVALID`), more than one extension such as `report.pdf.exe` or `invoice.exe.pdf` (`FILE_DOUBLE_EXTENSION`),
  extension not allowed (`FILE_TYPE_NOT_ALLOWED`), contents not an accepted type (`FILE_CONTENT_NOT_ALLOWED`), contents that
  don't match the extension (`FILE_TYPE_MISMATCH`), then the scan (`FILE_REJECTED_BY_SCAN`).
- The kept name is sanitised: folders, control characters and `< > : " | ? *` removed, leading/trailing dots and spaces trimmed,
  at most 255 characters (the extension survives truncation), a UTF-8 name that arrived as Latin-1 repaired.

**Downloads.** Streamed by the API after the permission check, with `Content-Disposition: attachment` built from the sanitised name,
`X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, and `Content-Length`. The response is the raw bytes, not the
JSON envelope (the TransformInterceptor passes a `StreamableFile` through).

## Other additions in Phase 3
- **`scope/`:** `taskScope`, `documentScope`, `followUpScope`, `reportScope` next to `clientScope` and `caseScope` (rules in each
  module's SPECS). Out of scope is always a 404.
- **`rules/duplicate-document.ts`:** the prototype's `findDuplicateDocument` (`normalizeTitle`, `findDuplicateRequest`), used by
  tasks and document requests.
- **`utils/dates.ts`:** `todayUtc`, `addDays`, `isoDay`. "Today", "overdue" and "not in the future" all mean the server's UTC
  calendar day, never the caller's clock.
- **Permissions:** `deleteDocument` (Admin, Manager) is a backend-only addition for soft-deleting documents, like `rollbackStage`.
- **Errors:** new codes for tasks, follow-ups, documents, files, filings and reports are listed in each module's SPECS.
