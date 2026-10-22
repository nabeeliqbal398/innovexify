# Analytics module

## Purpose
Reports & analytics for a date range. `GET /api/v1/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` needs `analytics` (**Admin and Manager**; the
Phase 4 brief mentioned Compliance "per the table", but the table does not include it, so it is refused with 403).

## Range
`to` defaults to today (UTC), `from` to 89 days before `to` (so 90 days). `to` is included. `from` after `to` is a 422 on `to`; a range longer
than **24 months** is a 422 ("The range can't be longer than 24 months. Choose a shorter one."): exactly 24 months is allowed, a day more is not.

## Response
`range`, `generatedAt` and:
- `cases`: `byStage`, `byStatus` (counts by enum key; the screen words them), `completed` in the range, `averageDaysToComplete`, `completedByMonth` (one row per month, zeros included).
- `documentReviews`: `reviewed`, `averageHoursToReview`, `sentBack` (rejected or needs-information), `sentBackRate` (0 to 1).
- `tickets`: `resolved`, `averageHoursToResolve`, `open`, `reopened` (a client asked to reopen within the range).
- `tasks`: `done` in the range, `open`, `overdue` (open and due before today).
- `csrs`: per active CSR `clients`, `openFollowUps`, `followUpsDone`, `interactions`, `openTickets`. `compliance`: per active Compliance user `reviews`, `ownedCases`, `openTasks`, `reportsTouched`.
- `onboarding`: `clients` and four steps (`acceptedInvitation`, `caseOpened`, `documentsUnderReviewOrLater`, `formationCompleted`) with `count` and `percent`.

**Zero denominators return `null`**, never 0, NaN or Infinity: averages with nothing behind them, `sentBackRate` with no reviews, every `percent`
with no clients.

## Computation and indexes
Group-bys through Prisma and raw SQL for averages and month buckets, all with the caller's scope in the WHERE (`common/scope/scope-sql.ts`). The range
filters are on `Case.completedAt`, `Document.reviewedAt`, `Ticket.resolvedAt`, `Task.completedAt`, `FollowUp.doneAt`, `Interaction.at` and `ReportEvent.at`;
`EXPLAIN` on 60,000 rows showed sequential scans without them, so migration `20261023100000_analytics_indexes` adds an index on each (the plans then use
`Case_completedAt_idx` and `Ticket_resolvedAt_idx`).

## Cache
Results are cached **60 seconds** (`ANALYTICS_CACHE_SECONDS`, 0 turns it off) per person and range, so a screen that polls doesn't re-run the queries.
The cache sits behind the `AnalyticsCache` interface (`interfaces/analytics-cache.ts`): the in-memory version keeps each instance's own copy (at most 200
entries). **To use Redis**, implement `get(key)` and `set(key, value, ttlSeconds)` with `GET` and `SET key value EX ttl` (JSON), and provide it under the
`ANALYTICS_CACHE` token in `AnalyticsModule` instead of `InMemoryAnalyticsCache`; nothing else changes. With several API instances and no shared cache a figure can be up to the TTL old on any one.

## Tests
`test/analytics.e2e-spec.ts`: access, range validation (24-month boundary), an empty database (nulls), a hand-computed fixture, whole-last-day handling, cache hit/miss and TTL 0.
