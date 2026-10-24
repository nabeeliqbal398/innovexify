# Phase 5: gaps found while moving the screens to the API

Each row: what a screen needed that the API did not give, and what was added (smallest change, with tests and a SPECS update).

| # | Screen | Gap | Resolution |
| --- | --- | --- | --- |
| 1 | Clients table | Last contact, next follow-up, onboarding progress and the "follow-up due / waiting on client / invitation pending" filters were computed in the browser from whole datasets | `GET /clients` and `GET /clients/:id` now return `lastContactAt`, `nextFollowUp`, `onboarding`, and `?filter=due\|invited\|waiting` (backend `clients/SPECS.md`) |
| 2 | Every picker (CSR, owner, assignee, handler) | Only Admin and Manager can list users, but a CSR must choose a colleague and Compliance an assignee | `GET /users/directory?role=` for any staff: active `{ id, name, role }`, no emails, never clients (backend `users/SPECS.md`) |
| 3 | Staff directory and drawer | Workload counts (clients, cases, tasks, overdue, follow-ups, tickets, reviews), last activity and "invited by" were computed from whole datasets and the audit log (Admin only) | `GET /users` and `GET /users/:id` return `workload`, `lastActivityAt` for staff and `invitedByName` for all (backend `users/SPECS.md`) |
| 4 | Client profile and case Timeline tab | The relationship timeline merged documents, tickets, messages, interactions, follow-ups and case events from whole datasets in the browser | `GET /clients/:id/timeline` merges them on the server, role-filtered (a CSR never gets document notes; relationship entries only for Admin, Manager, CSR) (backend `clients/SPECS.md`) |
| 5 | Case management table | The cases table showed each client's CSR and filtered/sorted by CSR, state, overdue target date, opened date and client name over the whole dataset | `GET /cases` returns `client.csr` and takes `csrId`, `state`, `overdue`, `openedFrom` and sorts `clientName`, `formationState` (backend `cases/SPECS.md`) |
| 6 | Follow-up center | The "recent client interactions" panel listed interactions across all the CSR's clients and completed follow-ups by completion time | `GET /followups/interactions` (scoped, newest first, with the client) and follow-ups sort `doneAt` (backend `followups/SPECS.md`) |
| C1 | Compliance calendar | Case targets, filing follow-ups, document chases, compliance tasks and reminders came from whole in-memory lists; reminders can only be listed per case | `GET /calendar?from&to` (filings module): all five kinds for a window, scoped, plus `overdueTotal` and `truncated` (backend `filings/SPECS.md`, `test/calendar.e2e-spec.ts`) |
| C2 | Document review queue | "All submissions" (everything except requested/shared) and "outstanding requests" (requested or rejected) cannot be asked with one `status` value | `GET /documents?group=submissions\|outstanding` (backend `documents/SPECS.md`, `test/documents-groups.e2e-spec.ts`) |
| C3 | Filing tracker | The State column needs the client's formation state, which the filing did not carry | `case.client.formationState` on each filing (`test/filings-extras.e2e-spec.ts`) |
| D1 | Ticket status buttons (staff and client) | The screens offered every status or guessed the client's reopen window; the rules live only in the server (status machine, `TICKET_REOPEN_DAYS`) | `allowedStatuses` on every ticket from `GET /tickets` and `GET /tickets/:id`: the statuses this person may move it to right now (backend `tickets/SPECS.md`) |
| D2 | Ticket queue "Active" filter | The list could filter by one status only; "Active" (not resolved or closed) needs several | `GET /tickets?group=active\|finished` |
| D3 | Links and search results carry the ticket number (TKT-1004) | Ticket routes took only the internal id | `/tickets/:id` also accepts `TKT-n`, same scoping |
| D4 | Client Home: next dates, stage history, document decisions | Needed the client's own case, events, documents and shared tasks | No new endpoint: `GET /cases`, `/cases/:id`, `/documents`, `/tasks` (already scoped to the client). Note: a client's document and case events carry no author, so updates read "Your team" |
| 7 | Tasks view and calendar | The "upcoming" chip and the calendar month needed due-date filtering over all tasks | `GET /tasks` takes `filter=upcoming`, `dueFrom` and `dueTo` (backend `tasks/SPECS.md`) |
| 8 | Staff directory | The list is "everyone who is not a client"; `role` takes one value | `GET /users?staff=true` (backend `users/SPECS.md`) |
| 9 | Side navigation badges | Unread messages, documents to review, open tickets, due follow-ups and overdue tasks were counted from whole datasets | `GET /dashboard/nav-counts` (one scoped call, polled every 30 s while the tab is visible; `dashboard/SPECS.md`) |
| 10 | Service catalog | "Active cases" per service was counted from all cases | `GET /services` returns `activeCases` for staff (`services/SPECS.md`) |
| 11 | Conversation list | **A defect found by the browser tests:** `writable` was always false and the status was the database label, because raw SQL returns enum labels | Fixed in the messages repository, with the test now asserting `writable` and the status key |
| 12 | Browser tests and go-live | The sign-in limit was fixed at 5 a minute, the log mailer left no trace a test could read, there was no way to create the first Admin in production, and uploads were never scanned | `AUTH_THROTTLE_LIMIT`, `MAIL_OUTBOX_FILE` (development only), `npm run admin:create`, `VIRUS_SCANNER=clamav` (ClamAV over TCP) and `MIGRATE_ON_START` (see `GO-LIVE.md`) |
| 13 | Case page after an edit | A second change made before the refetch finished was sent with the old version and shown as a conflict | The edit and stage-move responses update the open case's version at once (`applyToCase` in `store/api/cases.ts`) |

## Not available in the API, so not on the screens

| What the prototype showed | Why it is gone |
| --- | --- |
| Forgot password, reset password, two-factor sign-in, "session timed out" re-entry | The API has no such endpoints (listed in `GO-LIVE.md`, item 15). The sign-in page says to ask an administrator for a new invitation. |
| A list of "other sessions / devices" | The API only offers "sign out everywhere" (`POST /auth/logout-all`), which is what the screen now offers. |
| Recent activity on the Manager, CSR and Compliance overview | It comes from the audit log, which is Admin-only. |
| SVG logos and logos up to 2 MB | The server accepts PNG or JPEG up to 200 KB (an SVG can carry script). |
| The "Access & scenarios" side panel (a per-role capability list and "simulate a direct request" buttons) | Removed after Phase 7. Access rules are shown in **Audit & Security → Security overview**, which reads `GET /api/v1/access/matrix`; the server refusing crafted requests is covered by the backend and Playwright tests. |
