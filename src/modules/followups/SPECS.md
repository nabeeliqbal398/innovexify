# Follow-ups module (follow-ups and interactions)

## Purpose
A CSR's promises to a client (follow-ups) and the record of what was said (interactions). Rules come from
`frontend/src/store/actions/cases.ts` (`addFollowup`, `completeFollowup`, `recordInteraction`) and the follow-ups view.

## Database models
`FollowUp` (`type`, `due` date, `status` OPEN/DONE, `note`, `outcome`, `doneAt`), `Interaction` (`kind`, `text`, `by`, `at`),
read-only `User`/`ClientProfile`. Writes `AuditLog` (category `cases`).

## Endpoints
Base `/api/v1`. Everything needs the `followups` permission (Admin, Manager, CSR): Compliance and clients get
"Follow-ups are limited to the client's CSR, Manager and Admin."

| Method | Route | Request | Response `data` |
| --- | --- | --- | --- |
| GET | `/followups` | `?csrId&clientId&status&filter&sort&order&page&limit` | page of follow-ups |
| POST | `/followups` | `{ clientId, type, due, note }` | the follow-up |
| PATCH | `/followups/:id` | any of `type, due, note` (open ones only) | the follow-up |
| POST | `/followups/:id/done` | `{ outcome }` | the follow-up |
| DELETE | `/followups/:id` | none (open ones only) | the deleted follow-up |
| GET | `/clients/:clientId/interactions` | `?order&page&limit` (newest first by default) | page of interactions |
| POST | `/clients/:clientId/interactions` | `{ kind, text }` | the interaction |

`filter` (open follow-ups only): `overdue` (due before today), `today`, `upcoming` (after today). Sort fields: `due` (default),
`createdAt`, `status`. Each follow-up carries `overdue`, computed on the server.

## Scope
Admin and Manager: every follow-up and every client. CSR: only follow-ups whose `csrId` is theirs, and only clients assigned to
them. Another CSR's follow-up or client is a 404 on every route, and a filter can't widen that. (A follow-up belongs to the
CSR it was created for, so it stays theirs if the client is later reassigned.)

## Business rules
- **Create:** the client must be in the caller's scope (a CSR: their own; Admin and Manager choose any). `type` is an
  `InteractionType` (`CALL, EMAIL, PORTAL_MESSAGE, MEETING`). The due date can't be before today (`FOLLOWUP_DATE_IN_PAST`);
  today is fine. The note is required (1-500). The follow-up is assigned to the client's CSR, or to the creator when the client
  has none. A removed client: `USER_REMOVED`.
- **Done:** the outcome is required, 1 to 2000 characters, with its own code when missing or blank
  (`FOLLOWUP_OUTCOME_REQUIRED`). In one transaction the follow-up becomes DONE (`outcome`, `doneAt`) and an Interaction of the
  same kind with the outcome as text is written for the client. Completing twice, or racing, is `FOLLOWUP_DONE` and writes no
  second interaction.
- **Edit:** only open follow-ups (`FOLLOWUP_DONE`: "already done, so it can't be edited"). A past date may stay as it is while
  other fields change, but moving the date to one that has passed is refused.
- **Delete:** open ones only; a completed one stays in the client's history.
- **Who and when:** interactions store `by` and `at` (server time); every change is audited.

## Validation rules
Note 1-500, outcome at most 2000, interaction text 1-2000; enums known; unknown fields rejected; paging field-level errors.

## Edge cases handled
CSR creating for a colleague's or an unassigned client (404); a client with no CSR (the creator holds it); due date today and
yesterday; missing, blank, 1-character and 2000-character outcomes; double completion; editing or deleting a done follow-up;
reassigned clients; removed clients; Compliance and clients refused.

## Error codes
`FOLLOWUP_DATE_IN_PAST` 422, `FOLLOWUP_OUTCOME_REQUIRED` 422, `FOLLOWUP_DONE` 409, `USER_REMOVED` 409, `PERMISSION_DENIED` 403,
`RESOURCE_NOT_FOUND` 404, `VALIDATION_FAILED` 422.
