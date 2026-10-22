# Filings module (filing tracker and reminders)

## Purpose
The manual state-filing tracker and the illustrative reminders on a case. Nothing here reads from or writes to a state system.
Rules are ported from `frontend/src/store/actions/cases.ts` (`saveFiling`) and `compliance/filing-dialog.tsx`.

## Database models
`Filing` (`number` from counter `filing`, `type`, `status`, `submittedOn`, `reference`, `nextAction`, `nextActionDate`,
`outcome`), `Reminder` (`title`, `date`, `kind`, `illustrative`), `Counter`, `AuditLog` (category `cases`).

## Access
Every route needs `filingTracker` (Admin, Manager, Compliance): "The filing tracker is limited to Compliance, Manager and
Admin." Data is scoped to cases the caller can see (removed cases are hidden).

## Endpoints
Base `/api/v1`.

| Method | Route | Request | Response `data` |
| --- | --- | --- | --- |
| GET | `/filings` | `?status&nextActionFrom&nextActionTo&caseId&search&sort&order&page&limit` | page of filings |
| GET | `/cases/:caseId/filings` | same filters | page of that case's filings |
| POST | `/filings` | `{ caseId, type, status?, submittedOn?, reference?, nextAction?, nextActionDate? }` | the filing |
| PATCH | `/filings/:id` | any of `type, status, submittedOn, reference, nextAction, nextActionDate, outcome, reason` | the filing |
| GET | `/cases/:caseId/reminders` | `?page&limit` | page of reminders |
| POST | `/cases/:caseId/reminders` | `{ title, date, kind }` | the reminder |
| DELETE | `/cases/:caseId/reminders/:id` | none | the removed reminder |

Sort fields: `number` (default, newest first), `status`, `submittedOn`, `nextActionDate` (empty dates last), `type`. `search`
matches type, reference, client name, `FIL-9` or `PRJ-118`. Each filing carries `late` (next action date passed and not approved).

## Business rules
- **Numbers** come from `CounterService` key `filing` inside the creating transaction (`FIL-<n>`): unique and gap-free under
  parallel creation, and handed back if the write fails.
- **Submission date:** SUBMITTED, PENDING_STATE_REVIEW, APPROVED and REJECTED need one (`FILING_SUBMISSION_DATE_REQUIRED`, "Enter
  the submission date."). It can never be in the future, by the server's date (`FILING_DATE_IN_FUTURE`).
- **Approved needs the state's reference number** (`FILING_NUMBER_REQUIRED`, "Approved filings need the reference number issued
  by the state."). The same code the stage move uses for the case's confirmation number; the two are separate numbers.
- **Outcome:** Approved and Rejected set it to "Approved" / "Rejected"; otherwise a short note may be given (at most 40).
- **Status moves forward only:** Not submitted, Submitted, Pending state review, then Approved or Rejected (two endings at the same
  point; skipping ahead is fine). Moving to anything else, including Approved <-> Rejected, is a step back: Compliance gets
  `INVALID_STATE_TRANSITION`; Admin and Manager may do it with a `reason` (`FILING_REASON_REQUIRED`), which goes in the audit
  entry. The write only applies if the filing is still in the status the caller saw (`CONCURRENT_MODIFICATION` otherwise).
- **Effect on the case: none.** The prototype's `saveFiling` writes only the filing row. It does not move the case's stage, set
  its confirmation number, touch its version or notify anyone; a case at State Approval Received still needs the confirmation
  number on its stage move even if an Approved filing exists.
- **Completed case:** its filings can still be viewed and updated, but a new one is refused (`CASE_COMPLETED`). A removed case
  refuses new filings (`CASE_DELETED`).
- **Reminders** are always `illustrative: true` (it can't be set otherwise: the field isn't accepted) and every response carries
  the wording "Illustrative reminder: confirm the real date with the state. It is not a legal deadline." No response text
  describes one as a deadline except to say it is not one. Reminders can be added to completed cases.

## Validation rules
Type 1-120, reference at most 64, next action at most 200, reason at most 300, reminder title 1-200, kind 1-40; dates are real
`YYYY-MM-DD`; `nextActionFrom <= nextActionTo`; unknown fields rejected; paging field-level errors.

## Edge cases handled
Each status that needs a date; blank, missing and whitespace references; a date today and tomorrow; skipping ahead; stepping back
by Compliance, Manager and Admin with and without a reason; two conflicting status changes at once; 20 filings created in
parallel; completed and removed cases; a reminder on another case's id (404).

## Error codes
`FILING_SUBMISSION_DATE_REQUIRED` 422, `FILING_NUMBER_REQUIRED` 422, `FILING_DATE_IN_FUTURE` 422, `FILING_REASON_REQUIRED` 422,
`INVALID_STATE_TRANSITION` 409, `CONCURRENT_MODIFICATION` 409, `CASE_COMPLETED` 409, `CASE_DELETED` 409, `PERMISSION_DENIED` 403,
`RESOURCE_NOT_FOUND` 404, `VALIDATION_FAILED` 422.
