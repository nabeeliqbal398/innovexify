# Cases module

## Purpose
Formation cases (called projects in the prototype, shown as `PRJ-118`): list and detail, field edits, the stage workflow
and internal notes. The stage rules are ported from `frontend/src/store/actions/cases.ts` and live as pure functions in
`interfaces/case-rules.ts` (unit-tested without a database).

## Database models
`Case` (`version`, `stage`, `status`, `filingConfirmation`, `completedAt`, `lastActivityAt`, `deletedAt`), `CaseEvent`,
`CaseNote`, plus read-only use of `Filing` and `Task`; `Counter` (`case`), `Notification`, `AuditLog`.

## Endpoints
Base `/api/v1`. All need a bearer token. `:id` is the case's id (not the `PRJ-` number).

| Method | Route | Who | Request | Response `data` |
| --- | --- | --- | --- | --- |
| GET | `/cases` | anyone, scoped | `?stage&status&priority&ownerId&clientId&serviceId&deadlineFrom&deadlineTo&search&sort&order&page&limit` | page of cases |
| GET | `/cases/:id` | anyone, scoped | none | case + `events`, visible `notes`, `filings`, `tasks { total, open, overdue }` |
| GET | `/cases/:id/events` | anyone, scoped | `?order&page&limit` | page of timeline events |
| POST | `/cases` | `editCase` (Admin, Manager) | `{ clientId, serviceId, deadline, priority?, businessName?, formationState? }` | the case (refused with `CASE_ALREADY_EXISTS` only while the client has an **open** case) |
| PATCH | `/cases/:id` | `editCase` (Admin, Manager) | `{ version, priority?, deadline?, ownerId?, serviceId?, status? }` | the case |
| POST | `/cases/:id/stage` | `complianceMilestones` (Admin, Manager, Compliance) | `{ targetStage, version, filingConfirmation?, note? }` | the case |
| POST | `/cases/:id/notes` | `caseNotes` (staff) | `{ text, visibility?: "STAFF" \| "COMPLIANCE" }` | the note |

List filters: `ownerId=none` finds cases without an owner; the deadline range is inclusive; `search` matches client name,
email, business name, case ID, service name, or a number such as `PRJ-118` / `118`. Sort fields: `number, stage, status,
priority, deadline (cases without a date always last), lastActivityAt (default, newest first), createdAt`.

## Scope
Admin, Manager, Compliance: every case. CSR: cases of their assigned clients. Client: their own. Outside scope -> **404**
(same body as a case that doesn't exist), for reads and writes. Cases of a removed client are soft-deleted: only Admin and
Manager can open them (read-only).

## Stage rules
- Stage order is the order of the `CaseStage` enum: Invitation Sent, Client Onboarding, Information Required, Documents
  Pending, Documents Under Review, Ready for Filing, State Filing in Progress, State Approval Received, EIN Processing,
  Post-Formation Documents, Completed.
- **One step forward at a time.** Skipping -> `INVALID_STATE_TRANSITION`: `A case can't move from "Invitation Sent" to
  "Information Required". Stages are completed in order, so the next one is "Client Onboarding".` Same stage -> the same
  code ("already in that stage").
- **Backward** is an explicit rollback, allowed only where the permission table says so: `rollbackStage` (Admin, Manager;
  a backend-only entry, the prototype allowed any move). It needs a `note` as the reason (`ROLLBACK_REASON_REQUIRED`) and is
  recorded as "Rolled back: <reason>". Anyone else -> `INVALID_STATE_TRANSITION`.
- **Compliance** may move a case only between Documents Pending, Documents Under Review and Ready for Filing, and only when
  the case is *currently* in one of them (`can('complianceMilestones', { current, target })`, the prototype's two checks).
- **Filing number:** moving from State Approval Received (or earlier) past it needs the state's confirmation number unless
  one is already on file -> `FILING_NUMBER_REQUIRED` (422, field `filingConfirmation`). It is stored on the case.
- **Status is derived** from the stage: Completed at the last stage; otherwise On Hold / Blocked are kept; otherwise
  Awaiting Client up to Documents Pending and Active after. Moving to Completed sets `completedAt`.
- **Completed and removed cases reject edits** (`CASE_COMPLETED`, `CASE_DELETED`, with the case number in the message).
  Completed cases still accept notes; removed cases accept nothing.
- **Order of checks** on a stage move: scope (404), permission (403), completed/removed (409), version
  (`CONCURRENT_MODIFICATION`), then the transition rules. The version is checked before the rules because they depend on a
  state the caller may not have seen.

## Optimistic locking
Every edit and stage move carries `version`. The write is `UPDATE "Case" SET ..., version = version + 1 WHERE id = $1 AND
version = $2`; zero rows -> `CONCURRENT_MODIFICATION` ("Someone else changed this case ... Refresh ..."). Only that row is
locked, only until commit; nothing else is blocked. Notes update `lastActivityAt` but do not bump `version`. Soft-deleting a
client's cases does bump it. A PATCH that changes nothing writes nothing and keeps the version.

## Every stage change, in one transaction
Versioned update, `CaseEvent` (`toStage`, who, note incl. "State confirmation X"), `lastActivityAt`, in-app notification to
the client and the case owner according to their `STAGE` preferences (the actor is never notified), and an audit entry
(category `cases`). Emails to those who left email on go out **after** the commit, best effort: a mail outage never blocks
or undoes a stage change.

## Field edits
`priority`, `deadline` (`null` clears), `ownerId` (an active Compliance user; `null` clears; the new owner is notified),
`serviceId` (active only), `status` limited to Active, Awaiting Client, Blocked, On Hold (Completed only by moving the stage).
Each change is a timeline event (`toStage` null) and an audit entry.

## Notes
`STAFF`: every staff member who can see the case. `COMPLIANCE`: Admin, Manager, Compliance only (`caseNotesCompliance`).
Which notes `GET /cases/:id` returns comes from the same permission table: CSR gets STAFF notes only; a client gets none.
A COMPLIANCE note is never in any CSR or client response. Notes never notify the client.

## What a client sees
Stage changes only (stage and time, no names, notes or edits), only tasks marked for the client in the summary, no filings,
no notes.

## Validation rules
`targetStage` a known stage; `version` an integer >= 1; `filingConfirmation` at most 64; stage `note` at most 400; note text
1-5000; deadline a real `YYYY-MM-DD`; `deadlineFrom <= deadlineTo`; unknown fields rejected; paging as everywhere
(`page >= 1`, `limit <= 100`, field-level errors).

## Edge cases handled
Skip, same-stage and backward moves; rollback without a reason; missing, blank and already-recorded filing numbers; stale
and simultaneous versions (including two requests that both read version 1); completed and removed cases; Compliance
outside the document stages; a client with an open case already (`CASE_ALREADY_EXISTS`: open means not completed and not removed, so a client whose cases are all completed can have a new one); switched-off service; owner who isn't
Compliance or isn't active; notification switches off; mail outage after commit; case outside the caller's scope.

## Error codes
`INVALID_STATE_TRANSITION` 409, `FILING_NUMBER_REQUIRED` 422, `ROLLBACK_REASON_REQUIRED` 422, `CONCURRENT_MODIFICATION` 409,
`CASE_COMPLETED` 409, `CASE_DELETED` 409, `CASE_ALREADY_EXISTS` 409, `SERVICE_INACTIVE` 422, `INVALID_CASE_OWNER` 422,
`USER_REMOVED` 409, `PERMISSION_DENIED` 403, `RESOURCE_NOT_FOUND` 404, `VALIDATION_FAILED` 422.
