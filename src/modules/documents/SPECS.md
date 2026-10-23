# Documents module

## Purpose
Documents staff request from a client, the files a client uploads, review (approve, reject, ask for more), finished documents
shared with a client, and permission-checked downloads. File handling (what is accepted and how files are stored) is described
in `src/common/SPECS.md`.

## Database models
`Document` (`status`, `type`, `fileName`, `storageKey`, `mimeType`, `sizeBytes`, `reason`, `note`, `deletedAt`),
`DocumentEvent` (history), `Notification`, `AuditLog` (category `docs`). File bytes are never in the database.

## Endpoints
Base `/api/v1`. All need a bearer token.

| Method | Route | Who | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/documents` | anyone, scoped | `?clientId&status&type&search&sort&order&page&limit` | page of documents (role-specific view) |
| GET | `/documents/:id` | anyone, scoped | none | one document with its history |
| POST | `/documents/request` | `docsManage` (Admin, Manager, Compliance) | `{ clientId, name, type?, note? }` | the document (REQUESTED) |
| POST | `/documents/:id/upload` | the client who owns it | multipart: file in field `file` | the document (SUBMITTED) |
| POST | `/documents/:id/review` | `docsReview` (Admin, Manager, Compliance) | `{ decision: APPROVED \| REJECTED \| INFO, reason? }` | the document |
| POST | `/documents/share` | `docsManage` | multipart: `clientId`, optional `name`, file in `file` | the document (SHARED) |
| GET | `/documents/:id/download` | `docsAccess` (Admin, Manager, Compliance, the owning client) | none | the file's bytes |
| DELETE | `/documents/:id` | `deleteDocument` (Admin, Manager) | none | the document (soft-deleted) |

`?group=submissions|outstanding` narrows the list for the review queue and the outstanding-requests list (`submissions`: everything except still-requested and shared documents; `outstanding`: requested or sent back); it never widens a `status` filter.

Sort fields: `requestedAt` (default, newest first), `name`, `status`, `type`, `submittedAt` (documents with none last).

## Status machine
```
REQUESTED --upload--> SUBMITTED --review--> APPROVED
                          |  ^         \--> REJECTED --upload--> SUBMITTED
                          |  |          \--> INFO ------upload--> SUBMITTED
SHARED  (created by staff; final)
```
Upload is allowed from REQUESTED, REJECTED and INFO. Review is allowed only from SUBMITTED. Everything else is
`INVALID_STATE_TRANSITION`: `A document can't move from "Approved" to "Submitted". It was already approved...`, naming the
current and the target status and saying why. Each move is a conditional UPDATE (`WHERE status IN (...)`), so two requests
racing can't both succeed (the loser gets the same error and its file is removed).

## Who sees what
One response shape, three views, from the permission table:
- **Admin, Manager, Compliance:** everything (name, type, status, file name, type and size, reason, note, who requested and
  reviewed, the client, the history with who did what).
- **CSR:** only for their own clients' documents, and only *whether a document is required, waiting, approved or needs a
  correction*: id, name, type, status, client, dates. No file name, reason, note or history, and file names are left out of
  their `search`. They can't download (`docsAccess`): the attempt is refused (403) **and audited** as
  `Refused: Download <file> (<client>)`, category `docs`, `ok = false`, like the prototype's seeded row.
- **Client:** only their own; file details, reason and note; history without who did it; never `requestedBy`, `reviewedBy`,
  `client` or `deletedAt`.
- **Nobody** ever receives `storageKey`.
A document outside the caller's scope is a **404**, the same body as one that doesn't exist, for every route.

## Business rules
- **Request:** the client must be in scope and not removed. A request that repeats an open one for the same client
  (REQUESTED, REJECTED or INFO) is refused (`DUPLICATE_DOCUMENT_REQUEST`) naming the existing request. The match is the
  prototype's `findDuplicateDocument` (normalised title, containment either way, at least 4 characters).
- **Upload:** the file is checked, scanned and stored under a random key before the database write; see "Files stay in step"
  below. A new file replaces the previous one, which is deleted after the commit. Staff can't upload against a request
  (`DOCUMENT_UPLOAD_NOT_ALLOWED`: use Share).
- **Review:** `reason` is required for REJECTED and INFO (`DOCUMENT_REASON_REQUIRED`, 1-1000, the client sees it); approving
  clears it. The client is notified in the prototype's words (`"Passport" needs a correction: ...`).
- **Every status change** writes a `DocumentEvent`, notifies the other side according to their `DOCUMENTS` preferences (a client
  upload tells every active Admin, Manager and Compliance user) and an audit entry, in one transaction. Emails go out after the commit.
- **Share:** staff attach a finished file; it is SHARED, visible to the client at once, and not reviewable or replaceable.
- **Delete:** soft. The record and the file stay; everyone but Admin and Manager stops seeing it; changes to it are refused
  (`DOCUMENT_DELETED`). Documents of a removed client are hidden the same way.
- **Download:** `Content-Type` is the type detected from the file's content, `Content-Disposition: attachment` built from the
  sanitised name (ASCII fallback plus RFC 5987 `filename*`), `X-Content-Type-Options: nosniff`, `Cache-Control: private,
  no-store`. Each download is audited. A document with no file yet is `DOCUMENT_HAS_NO_FILE`; a file missing from storage is
  `STORAGE_FAILED` (logged as an integrity problem). There is no preview route and no static serving.

## Files stay in step with the database
Upload and share store the file first, then write the row. If the write (or its transaction) fails, the stored file is deleted;
if storing fails, nothing is written. A re-upload that fails keeps the previous file and removes only the new one. Both orders
are tested, along with two uploads racing (one file left).

## Validation rules
Name 1-200, note at most 500, reason at most 1000; `decision`, `type`, `status` known values; unknown fields rejected; file
rules in `common/SPECS.md`; paging field-level errors.

## Error codes
`INVALID_STATE_TRANSITION` 409, `DUPLICATE_DOCUMENT_REQUEST` 409, `DOCUMENT_REASON_REQUIRED` 422, `DOCUMENT_UPLOAD_NOT_ALLOWED`
403, `DOCUMENT_HAS_NO_FILE` 409, `DOCUMENT_DELETED` 409, `FILE_REQUIRED` 422, `FILE_EMPTY` 422, `FILE_TOO_LARGE` 413,
`FILE_TYPE_NOT_ALLOWED` 415, `FILE_DOUBLE_EXTENSION` 415, `FILE_CONTENT_NOT_ALLOWED` 415, `FILE_TYPE_MISMATCH` 415,
`FILE_NAME_INVALID` 422, `FILE_REJECTED_BY_SCAN` 422, `STORAGE_FAILED` 503, `PERMISSION_DENIED` 403, `RESOURCE_NOT_FOUND` 404,
`USER_REMOVED` 409, `VALIDATION_FAILED` 422.
