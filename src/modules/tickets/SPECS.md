# Tickets module

## Purpose
Support tickets: a client raises one, the team works it through statuses, replies (with internal notes the client never sees),
and resolves it with a note the client reads.

## Database models
`Ticket` (`number` shown as TKT-n, `clientId`, `caseId?`, `title`, `category`, `priority`, `status`, `handlerId`, `escalated`,
`resolutionNote`, `resolvedAt`, `version`), `TicketMessage` (`internal` flag), `TicketEvent` (history), `Notification`,
`AuditLog` (category `tickets`), counter `ticket`.

## Endpoints
Base `/api/v1`. All need a bearer token.

| Method | Route | Who | Notes |
| --- | --- | --- | --- |
| GET | `/tickets` | anyone, scoped | `?status&group=active|finished&priority&category&clientId&handlerId&escalated&search&sort&order&page&limit` |
| POST | `/tickets` | a client for themselves; staff for a client in scope | `{ title, category, description, priority?, caseId?, clientId? }` |
| GET | `/tickets/:id` | anyone who may see it | thread and history; **internal notes are filtered in the query for a client** |
| POST | `/tickets/:id/messages` | anyone who may see it | `{ text, internal? }` (`internal` is staff-only); a closed ticket takes none |
| POST | `/tickets/:id/status` | see below | `{ status, version, note? }` |
| POST | `/tickets/:id/assign` | `ticketsStaff` | take it, or (Admin, Manager) `{ handlerId }` |
| POST | `/tickets/:id/escalate` | `ticketsStaff` | `{ escalated }` |
| POST | `/tickets/:id/resolve` | `ticketsStaff` | `{ resolutionNote, version }`; the note is required |
| POST | `/tickets/:id/close` | the client (after resolution) or staff | final |

A route's `:id` may also be the ticket number (`TKT-1004`, any case), with the same scoping.

Scope: a client their own; a CSR their clients'; Admin and Manager every ticket; Compliance every ticket of an existing client.

## Status machine
Active statuses (Open, In Progress, Waiting for Client, Waiting for Internal Team) move freely among themselves and may be resolved
or closed. Resolved goes to Open (reopen) or Closed. Closed is final (`TICKET_CLOSED`). Anything else is
`INVALID_STATE_TRANSITION` naming both statuses. A client can only reopen a resolved ticket (within `TICKET_REOPEN_DAYS`, default 7,
`TICKET_REOPEN_WINDOW_PASSED`) or confirm it (close); all other statuses are the team's (`TICKET_STATUS_STAFF_ONLY`).

Each ticket carries `allowedStatuses`: the statuses the caller may move it to right now (staff: the workflow's next steps; a client: Closed and Open while Resolved, Open only inside the reopen window), so a screen offers only valid buttons.

## Rules
- **Version locking:** status, resolve, assign and escalate carry the `version` the caller loaded; a stale one is
  `CONCURRENT_MODIFICATION` (409) with the current state.
- **Resolution:** `resolutionNote` is required (`TICKET_RESOLUTION_REQUIRED`) and is what the client reads.
- **Assignment:** anyone with `ticketsStaff` may take a ticket; only Admin and Manager hand it to someone else, who must be an active staff member (`INVALID_TICKET_HANDLER`).
- **Escalation:** a resolved or closed ticket can't be escalated (`TICKET_ESCALATION_NOT_ALLOWED`); removing an escalation is always allowed.
- **Client history** hides events where the status did not change (internal reassignments) and any internal note.
- **Notifications:** the other side is notified in-app; email follows preferences and the `ticket` trigger.

## Tests
Unit `interfaces/ticket-rules.spec.ts`; `test/tickets.e2e-spec.ts`: scoping, status machine, locking races, internal-note
filtering at the database level, reopen window, notifications.
