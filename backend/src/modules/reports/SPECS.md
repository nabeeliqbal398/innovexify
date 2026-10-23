# Reports module (CSR reports to Compliance)

## Purpose
The compliance workflow's inbox: a CSR raises something about one of their own clients, Compliance answers, asks for
clarification and resolves it. Rules come from `frontend/src/store/actions/comms.ts` (`submitReport`, `replyReport`,
`setReportStatus`, `acknowledgeReport`, `addReportNote`) and `reports/report-status.ts` ("Reviewed" is shown as "Resolved").

## Database models
`Report` (`number` from counter `report`, `status`, `category`, `priority`, `action`), `ReportMessage` (`isNote`), `ReportEvent`,
`Counter`, `Notification`, `AuditLog` (category `reports`).

## Endpoints
Base `/api/v1`. Reports are internal: `reportView` (staff). A client gets "Reports are internal and visible only to staff."

| Method | Route | Who | Request | Response `data` |
| --- | --- | --- | --- | --- |
| GET | `/reports` | staff, scoped | `?status&priority&category&clientId&csrId&search&sort&order&page&limit` | page of reports |
| POST | `/reports` | `reportSend` (CSR) | `{ clientId, title, body, category?, priority?, action?, caseId? }` | the report with thread and events |
| GET | `/reports/:id` | staff, scoped | none | the report, its thread (without Compliance notes for a CSR) and events |
| POST | `/reports/:id/messages` | staff, scoped | `{ text }` | the message |
| POST | `/reports/:id/notes` | `reportReview` (Compliance) | `{ text }` | the note |
| POST | `/reports/:id/status` | `reportReview` (Compliance) | `{ status: ACKNOWLEDGED \| CLARIFICATION_REQUESTED \| REVIEWED }` | the report |

Sort fields: `createdAt` (default, newest first), `number`, `priority`, `status`, `updatedAt`. `search` matches the title, the
client's name, or `RPT-201`. Every report carries `statusLabel` ("Resolved" for REVIEWED).

## Scope
A CSR sees only reports they filed, Compliance, Manager and Admin see all, a client sees none. Another CSR's report is a **404** on
every route a CSR may call. Notes and status changes are Compliance's: a CSR is refused (403) before any report is looked up.

## Business rules
- **Submit:** only about the CSR's own assigned client; any other client, including an unassigned one, is a 404. The optional
  `caseId` must belong to that client (`CASE_CLIENT_MISMATCH`); without it the client's current case is linked (the prototype's
  `projectOfClient`). Title 1-200, body 1-5000, action at most 500, category and priority default to Other and Normal. Number
  `RPT-<n>` from counter `report`, a `SUBMITTED` event, a notification to every active Compliance user, an audit entry, all in one
  transaction.
- **Status path:** `SUBMITTED` -> `ACKNOWLEDGED` -> `CLARIFICATION_REQUESTED` or `REVIEWED`; from `SUBMITTED` Compliance may also go
  straight to either; from `CLARIFICATION_REQUESTED` only to `REVIEWED`. `REVIEWED` (Resolved) is final. A move not on that path is
  `INVALID_STATE_TRANSITION` saying why. The write applies only if the report is still in the status the caller saw.
  A CSR's reply to a clarification request puts the report back to `SUBMITTED` (a new event), as the prototype does.
- **Replies:** the CSR who filed it and any staff who can see it. A resolved report accepts none (`REPORT_CLOSED`), even if it was
  resolved a moment after the caller read it. Staff replies notify the CSR; a CSR's reply notifies Compliance.
- **Compliance-only notes:** written by Compliance, readable by Compliance, Manager and Admin. For a CSR the database query itself
  excludes them (`isNote = false`), so they are never loaded, never in a list, reply or status response. Notes can be added to a
  resolved report.
- **Every status move** writes a `ReportEvent`, an audit entry and a notification to the CSR ("RPT-201 was acknowledged by ...",
  "RPT-201: Clarification requested", "RPT-201: Resolved").

## Edge cases handled
Another CSR's report; an unassigned or removed client; a case that belongs to someone else; 20 reports filed together; every
(status, target) pair; a resolved report's replies; two simultaneous status changes; a CSR trying to write a note or change status.

## Error codes
`CASE_CLIENT_MISMATCH` 422, `REPORT_CLOSED` 409, `INVALID_STATE_TRANSITION` 409, `CONCURRENT_MODIFICATION` 409, `PERMISSION_DENIED`
403, `RESOURCE_NOT_FOUND` 404, `VALIDATION_FAILED` 422.
