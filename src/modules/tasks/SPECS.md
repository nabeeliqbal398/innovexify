# Tasks module

## Purpose
Work items on a case: who does what by when, and who finished it. Rules come from `frontend/src/store/actions/cases.ts`
(`createTask`, `saveTask`, `toggleTask`, `addProjectTask`, `taskPermission`) and `tasks/task-helpers.ts`.

## Database models
`Task` (`type`, `visibility`, `done`, `priority`, `due` date, `createdBy`, `assignee`, `completedBy`, `completedAt`), read-only
use of `Case`, `Document` (for the duplicate check). Writes `AuditLog` (category `cases`) and `Notification`.

## Endpoints
Base `/api/v1`. All need a bearer token.

| Method | Route | Who | Request | Response `data` |
| --- | --- | --- | --- | --- |
| GET | `/tasks` | anyone, scoped | `?caseId&assigneeId&type&priority&done&filter&search&sort&order&page&limit` | page of tasks |
| GET | `/tasks/:id` | anyone, scoped | none | the task |
| POST | `/tasks` | Admin, Manager, CSR, Compliance | `{ caseId, title, assigneeId?, priority?, due?, visibility? }` | the task |
| PATCH | `/tasks/:id` | `manageTasks` (Admin, Manager) | any of `title, due, priority, assigneeId, visibility` | the task |
| POST | `/tasks/:id/complete` | CSR (own clients' cases), Compliance, Admin, Manager | none | the task |
| POST | `/tasks/:id/reopen` | same | none | the task |
| DELETE | `/tasks/:id` | its creator, Admin, Manager | none | the deleted task |

`filter`: `overdue` (open and due before today), `today` (open, due today), `week` (open, due today to 7 days ahead), `mine`
(assigned to me). Combines with `done`. Sort fields: `due` (default, soonest first), `priority`, `title`, `createdAt`, `done`.
`search` matches the title, the client's name, or a number like `PRJ-118`. Each task carries `overdue`, computed on the server.

## Scope
Admin and Manager: every task on a case they can see. CSR: tasks on their own clients' cases. Compliance: tasks assigned to them,
created by them, or on a case they own (the prototype's `allTasks` is Admin and Manager only, so Compliance doesn't get the whole
list). Client: only tasks with `visibility = CLIENT`, on their own case. Outside scope is a 404. Tasks of a removed case are hidden.

## Business rules
- **Assignee:** an active staff user (never a client, never suspended or removed): `INVALID_TASK_ASSIGNEE`. Admin and Manager
  may choose anyone; a CSR or Compliance user may only give work to themselves (`TASK_ASSIGNEE_NOT_ALLOWED`). Defaults to the
  caller. The task `type` follows the assignee's role (Compliance, CSR follow-up, Operations), as in the prototype.
- **Due date:** a real `YYYY-MM-DD`, not before 2020-01-01 (`TASK_DUE_DATE_INVALID`). Required from Admin and Manager
  ("Choose a due date."); CSR and Compliance default to three days from today (the prototype's `addProjectTask`).
- **Completed or removed case:** no new tasks (`CASE_COMPLETED`: "...so no new tasks can be added to it"; `CASE_DELETED`).
- **Duplicates:** a title that only repeats an open document request (requested, rejected or needs more information) for that
  client is refused (`DUPLICATE_DOCUMENT_REQUEST`), using the prototype's `findDuplicateDocument` (see `common/rules`).
- **Clients** can see tasks marked for them but never create, edit, complete, reopen or delete any: `PERMISSION_DENIED`.
- **Notifications:** the assignee when someone else assigns them; the client when a task is marked for them.
- **Complete / reopen** record `completedBy` and `completedAt` (cleared on reopen) in one conditional UPDATE, so two people
  completing at the same moment are credited once. Repeating either is not an error: the response says "already completed by
  X. Nothing was changed." and nothing is audited a second time.
- **Delete** is a hard delete, only by the creator, an Admin or a Manager (`TASK_DELETE_NOT_ALLOWED`, refusal audited).
- **"Overdue"** uses the server's date (UTC calendar day), never the caller's clock.
- **Removing a user** with open tasks is blocked (users module, `REASSIGNMENT_REQUIRED`); tasks are handed over with
  `PATCH /tasks/:id`. Suspending is deliberately not blocked.

## Validation rules
Title 1-200 characters; `priority`, `visibility` known values; dates as above; unknown fields rejected; paging `page >= 1`,
`1 <= limit <= 100`, field-level `422`.

## Edge cases handled
Client as assignee; suspended or removed assignee; CSR assigning to a colleague; due date in 2019, a malformed or impossible
date; completed and removed cases; a duplicate of an open document request (and not once it is approved); two people
completing together; completing twice; reopening an open task; deleting someone else's task; a CSR reaching another CSR's
case or task (404); a client editing a task marked for them.

## Error codes
`INVALID_TASK_ASSIGNEE` 422, `TASK_ASSIGNEE_NOT_ALLOWED` 403, `TASK_DUE_DATE_INVALID` 422, `TASK_DELETE_NOT_ALLOWED` 403,
`CASE_COMPLETED` 409, `CASE_DELETED` 409, `DUPLICATE_DOCUMENT_REQUEST` 409, `PERMISSION_DENIED` 403, `RESOURCE_NOT_FOUND` 404,
`VALIDATION_FAILED` 422.
