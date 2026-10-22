# Clients module

## Purpose
Clients (users with role `CLIENT`) as the team works with them: the list and profile, the CSR who looks after them, and the
transaction that invites a new one together with their case ID and first case.

## Database models
`User` (role CLIENT), `ClientProfile` (case ID, CSR, business, state, phone, address, contact preference),
`Case` + `CaseEvent` (the first case), `InvitationToken`, `Counter` (`client`, `case`), `Notification`, `AuditLog`.

## Endpoints
Base `/api/v1`. All need a bearer token.

| Method | Route | Who | Request | Response `data` |
| --- | --- | --- | --- | --- |
| GET | `/clients` | staff (`viewClients`), scoped | `?search&status&csrId&state&sort&order&page&limit` | page of clients, each with its current case |
| GET | `/clients/:id` | `viewClient`, scoped | none | profile, assigned CSR, `cases[]`, `caseSummary { total, open, completed }` |
| POST | `/clients` | `inviteCLIENT` (Admin, Manager, CSR) | `{ email, name?, csrId?, serviceId?, businessName?, formationState?, priority?, deadline?, note? }` | the new client (detail shape) |
| PATCH | `/clients/:id/profile` | Admin, Manager: all fields. The client: own `phone, address, contactPreference, preferredName` | any of `businessName, formationState, phone, address, contactPreference, preferredName` | client detail |
| PATCH | `/clients/:id/csr` | assign (none yet): Admin, Manager, CSR. Reassign (has one): Admin, Manager | `{ csrId, reason? }` | client detail |

List: `csrId=none` finds clients without a CSR; `state` matches the formation state case-insensitively; `search` matches
name, email, business name and case ID. Sort fields: `name, email, status, caseNumber, businessName, formationState,
joinedAt, createdAt (default, newest first)`.

## Scope (who sees which client)
Admin, Manager, Compliance: every client. CSR: only clients assigned to them. Client: only themselves. A client outside the
caller's scope is a **404** (`RESOURCE_NOT_FOUND`), identical to one that doesn't exist; this covers reads *and* writes.
Removed clients are visible to Admin and Manager only (read-only). Filters can narrow a list, never widen the scope.
Implemented once in `common/scope/scope.ts`.

## Business rules
- **Create = one transaction:** user (`INVITED`, `invitedById`), profile with the next case ID (`CASE-<year>-<NNNN>` from
  counter `client`, prefix from the company setting), the first case (`PRJ-<n>` from counter `case`) at **Invitation Sent**,
  status **Awaiting Client**, a "Case created" timeline event, the CSR assignment with its audit entry and in-app
  notification ("New client assigned to you: ..."), three audit entries (invited, case created, CSR assigned) and the
  invitation link (a hashed, single-use token). If any of that throws (the notification insert, say), everything rolls back,
  including the counters, so a failed attempt leaves no half-created client and no gap in the numbers.
- **The invitation email is sent after the commit.** A mail outage must not undo a client who was created correctly. If
  sending fails the client is kept, the failure is logged and written to the audit log (`ok = false`, category `users`), and
  the `201` response carries `data.invitationEmailSent: false` and a message telling the user to use "Resend invitation"
  (`POST /users/:id/resend-invitation`). On success `invitationEmailSent` is `true`.
- **Numbers are atomic:** `UPDATE "Counter" SET value = value + 1 ... RETURNING value` inside the transaction, always
  `client` then `case`. 20 parallel creations get 20 distinct, gap-free numbers.
- **CSR on create:** a CSR must name one (`CSR_REQUIRED`; `"me"` means themselves; they may name a colleague). Admin and
  Manager may leave it empty. The CSR must exist, have role CSR and be active (`INVALID_CSR_ASSIGNMENT`).
- **Service** defaults to `llc`; unknown -> field error on `serviceId`; switched off -> `SERVICE_INACTIVE`.
- **Duplicate email** (case-insensitive, among non-removed accounts) -> `EMAIL_IN_USE` naming the email.
- **Profile edits:** Admin and Manager (`editCase`) may change every field. A client may change only their own contact
  fields; `businessName`/`formationState` -> `PERMISSION_DENIED` saying who can. Empty body -> field error; unchanged values
  write nothing. A removed client -> `USER_REMOVED`.
- **CSR assignment:** with no CSR yet it needs `assignNewClient`; with one it needs `reassignClient` (Admin, Manager). Same
  CSR -> `CSR_UNCHANGED`. Reassigning notifies **both** CSRs; every change is audited (with the reason) in category `cases`.
  A client cannot be left without a CSR through this route (`csrId` is required).
- **Invitation** link and email come from `InvitationService` (see auth SPECS); accepting it activates the client and sets
  `joinedAt`, and notifies the CSR.

## Validation rules (ported from the frontend)
Phone: digits, spaces, `+ - ( )`, 7-20 characters, empty clears it (`people.ts`). Address at most 300, business name at most
160, preferred name at most 120, name at most 120 (column sizes). Formation state: one of Wyoming, Delaware, New Mexico,
Florida, Texas (`FORMATION_STATES`), empty clears it on edit. Priority and contact preference must be known values.
Deadline: a real date `YYYY-MM-DD`. Note at most 500. Unknown fields rejected.
`frontend/src/lib/validators.ts` contains only email, password, OTP and recovery-code rules, no phone or address limits, so
the limits above come from `people.ts` and the database column sizes.

## Edge cases handled
Duplicate email in another case; assigning a non-CSR, a suspended CSR, an unknown CSR, the same CSR again; client with no
CSR (list filter, later assignment); editing a removed client; phone and address length limits and boundaries; a CSR who
creates a client for a colleague (cannot open it afterwards); notification failure mid-create (rolls back); invitation email failure after the commit (client kept); 20 parallel creates;
a client editing someone else's profile (404) or restricted fields (403).

## Error codes
`EMAIL_IN_USE` 409, `CSR_REQUIRED` 422, `INVALID_CSR_ASSIGNMENT` 422, `CSR_UNCHANGED` 422, `SERVICE_INACTIVE` 422,
`USER_REMOVED` 409, `PERMISSION_DENIED` 403, `RESOURCE_NOT_FOUND` 404, `VALIDATION_FAILED` 422, `INTERNAL_ERROR` 500 (create
rolled back because a step inside the transaction failed; an email failure is NOT an error, see `invitationEmailSent`).
