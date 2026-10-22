# Dashboard module

## Purpose
The numbers each role lands on. `GET /api/v1/dashboard/overview` (any signed-in user) returns one shape for every role:
`{ role, generatedAt, kpis: [{ key, value, detail? }], ...sections }`. The server returns numbers and ids; wording, colours and links are the screen's.

## How it is computed
Each figure is a `COUNT` or `GROUP BY` in the database under the caller's data scope: the Prisma scope helpers (`caseScope`, `taskScope`,
`documentScope`, `ticketScope`, ...) for counts, and their SQL twins in `common/scope/scope-sql.ts` for the date-bucketed trends. Nothing is
loaded to be counted in code. A test compares the two scope forms on one fixture for every role (`test/scope-sql.e2e-spec.ts`).
"Finished" means stage or status `COMPLETED`; "active" is the rest.

## By role
- **Admin, Manager:** `totalClients` (+ active cases), `awaitingClientInformation`, `underComplianceReview`, `stateFilingsInProgress`,
  `completedFormations`, `openTasks` (+ overdue), `pendingDocumentReviews`, `openTickets` (+ escalated or high priority); Manager also
  `complianceReports` (+ awaiting review). Sections: `stageDistribution`, `trends` (cases completed and tasks done, per month for the last 6 and per
  7-day window for the last 8, zeros included), `deadlines` (cases due within 14 days and tasks within 7, up to 8), `workload` (CSR and Compliance rows with a
  0 to 100 load), `needsAttention`. **Admin only:** `activity` (the latest successful audit entries; the audit log is Admin's).
- **CSR:** their own clients: `assignedClients` (+ invited), `activeCases`, `followUpsDue` (+ overdue), `pendingClientResponses`, `openTickets`,
  `followUpsCompletedLast30Days`; `needsAttention` lists clients to follow up. (Unread-message counts are on `/messages/unread-count`.)
- **Compliance:** `documentsAwaitingReview`, `documentsNeedingCorrection`, `upcomingComplianceDeadlines`, `blockedByMissingInformation`,
  `activeComplianceMilestones`, `highPriorityCases`, `reportsAwaitingReview`; `needsAttention` (documents to review) and `recentReviews`.
- **Client:** `documentsNeedingAction`, `openTickets`, `unreadNotifications`, and their latest `case`.

"Today" and "this month" are the server's, in UTC. The figures are live (not cached); only analytics is cached.

## Tests
`test/dashboard.e2e-spec.ts`: a fixture whose every figure is worked out by hand, per role, plus an empty database.
