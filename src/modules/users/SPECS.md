# Users module

## Purpose
Accounts: who can sign in, with which role, and in which state. Invitations, edits, suspension and (soft) removal.
Clients are *created* in the clients module (`POST /clients`), because creating one also creates their case ID and first
case; once they exist they are ordinary rows in this module (rename, email, suspend, remove).

## Database models
`User` (status `INVITED | ACTIVE | SUSPENDED | REMOVED`, `deletedAt`), `InvitationToken`, `RefreshToken`,
`NotificationPreference`, `AuditLog`, `Notification`. Uses `AuditService`, `AccessService`/`PermissionsGuard`,
`InvitationService` (auth module), `MailService`, `NotificationService`.

Email uniqueness is a **partial unique index** on `lower(email) WHERE status <> 'Removed'` (migration
`20261022090000_user_email_unique_among_active`). Removing an account gives its email back, as the prototype allowed.

## Endpoints
Base `/api/v1`. All need a bearer token. Standard envelope; lists return `data` as an array plus `meta`.

| Method | Route | Who | Request | Response `data` |
| --- | --- | --- | --- | --- |
| GET | `/users` | Admin, Manager | `?search&role&status&sort&order&page&limit` | page of users |
| GET | `/users/:id` | Admin, Manager | none | user (removed accounts included, read-only) |
| POST | `/users` | Admin, Manager, then `invite<ROLE>` | `{ email, role, name?, note? }` | the invited user (`INVITED`) |
| POST | `/users/:id/resend-invitation` | Admin, Manager; CSR for their own clients | none | the user |
| PATCH | `/users/:id` | self always; others follow `updateEmail` | `{ name }` | the user |
| PATCH | `/users/:id/email` | `updateEmail` (Admin; Manager except Admin and other Managers) | `{ email }` | the user |
| PATCH | `/users/:id/status` | `suspendUser` (Admin, Manager; Manager not on Admin/Manager) | `{ status: "SUSPENDED" \| "ACTIVE", reason? }` | the user |
| DELETE | `/users/:id` | `removeUser` (Admin) | none | the removed user |
| GET | `/users/me/notification-preferences` | any signed-in user | none | all 5 categories `{ category, email, inApp }` |
| PATCH | `/users/me/notification-preferences` | any signed-in user | `{ preferences: [{ category, email?, inApp? }] }` | all 5 categories |

Sort fields for the list: `name, email, role, status, createdAt (default, newest first), lastLoginAt`. Naming a `sort`
without `order` means ascending. Removed accounts only appear with `status=REMOVED`.

## Business rules
- **Who may invite which role** comes from `can()`: `inviteMANAGER` Admin; `inviteCSR` and `inviteCOMPLIANCE` Admin and
  Manager. A refusal is audited (`ok = false`) and answered with the rule's own text ("Only Admin can invite Managers.").
- **Admins and clients are not invited here.** `ADMIN` -> `INVALID_INVITE_ROLE` ("can't be created by invitation").
  `CLIENT` -> `INVALID_INVITE_ROLE` pointing at `POST /clients`.
- **Invitation:** the user is created `INVITED`; a random single-use token is created (only its SHA-256 is stored) with
  expiry `INVITATION_TTL_DAYS`; the link is emailed through `MailService`. User, token, audit entry and the email are one
  transaction, the email last: if it cannot be handed over, nothing is kept. A re-invite (resend, or an email correction
  for someone still invited) retires every earlier unused link.
- **Email** is lower-cased and unique case-insensitively among non-removed accounts. The message names the email
  (`EMAIL_IN_USE`). A concurrent duplicate is caught by the index and reported the same way.
- **Self-protection:** you cannot suspend or remove yourself (`SELF_ACTION_NOT_ALLOWED`, checked before the permission
  table so the message is specific).
- **Last Admin:** the last active Admin cannot be suspended or removed (`LAST_ADMIN_PROTECTED`). The check runs inside the
  transaction after `SELECT ... FOR UPDATE` on every active Admin row, so two Admins acting on each other at the same
  moment cannot both succeed.
- **Removing staff with work still on their plate** is refused (`REASSIGNMENT_REQUIRED`): a CSR with assigned clients or
  open tasks, any other staff member with open tasks. The message says how many of each ("2 assigned clients and 3 open
  tasks"). Reassign first (`PATCH /clients/:id/csr`, `PATCH /tasks/:id` with a new assignee). **Suspending is not blocked by
  open tasks**: a compromised account must be stoppable at once, and suspension keeps everything in place.
- **Suspension and removal are immediate.** Refresh tokens are revoked in the same transaction; the access token is
  refused on its next use because `JwtAuthGuard` re-reads the account status on every request.
- **Removal is soft:** status `REMOVED`, `deletedAt` set, every record kept. Pending invitations are expired. Removing a
  client also soft-deletes their cases (read-only, hidden from everyone but Admin and Manager).
- **Status changes** are `ACTIVE -> SUSPENDED` and `SUSPENDED -> ACTIVE` only. Anything else is
  `INVALID_STATE_TRANSITION` with the reason (already in that state; an invited person must accept or be removed).
- **Removed accounts are read-only:** every write returns `USER_REMOVED` naming the person.
- **Name:** your own is always editable; someone else's follows the `updateEmail` rule (the permission table has no
  separate "edit name" entry).
- **Email change** also sends a notice to the old address (best effort, never undoes the change), adds an in-app
  notification for the person, and re-sends the invitation to the new address if they have not accepted yet.
- **Notification preferences:** five categories (`MESSAGES, DOCUMENTS, STAGE, TICKETS, ANNOUNCEMENTS`), each with `email`
  and `inApp`, both on by default. Only the categories sent are changed.
- **Audit:** every change writes an `AuditLog` row (category `users`) inside its transaction.
- SMTP: `LogMailService` only logs the email. Replace the provider in `MailModule` to send for real (see `common/SPECS.md`).

## Validation rules
Email valid, trimmed, lower-cased, at most 254. Name 1-120 characters (optional on invite, defaults to the part before the
`@`). Note at most 500. Reason at most 300. `role`, `status`, `category` must be known values. Unknown fields are
rejected. Paging: `page >= 1`, `1 <= limit <= 100`, otherwise a field-level `422` (never clamped).

## Edge cases handled
Duplicate email in different case; email of a removed account reused; concurrent duplicate invitations; invite email
fails (rollback); resend to someone already active or removed; correcting the email of someone still invited; Manager
acting on Admin/Manager accounts; suspend or remove self; two Admins removing each other; CSR with clients or tasks;
suspended user's live access token; removed user's token; reactivating a suspended account; suspending an invited one;
renaming to the same name (no write, no audit); duplicate or empty preference changes.

## Error codes
`EMAIL_IN_USE` 409, `EMAIL_UNCHANGED` 422, `INVALID_INVITE_ROLE` 422, `INVITATION_NOT_PENDING` 409,
`SELF_ACTION_NOT_ALLOWED` 409, `LAST_ADMIN_PROTECTED` 409, `REASSIGNMENT_REQUIRED` 409, `USER_REMOVED` 409,
`INVALID_STATE_TRANSITION` 409, `PERMISSION_DENIED` 403, `RESOURCE_NOT_FOUND` 404, `VALIDATION_FAILED` 422,
`ACCOUNT_INACTIVE` 403 (the suspended user's next request), `UNAUTHENTICATED` 401.
