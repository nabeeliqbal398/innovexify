# Announcements module

## Purpose
Notices from the team to all clients or one client: drafts, publishing, expiry and acknowledgements.

## Database models
`Announcement` (`title`, `body`, `priority`, `status DRAFT|PUBLISHED|ARCHIVED`, `audienceId` null for everyone, `expiresAt`,
`requiresAck`, `publishedAt`), `AnnouncementAck` (who acknowledged and when), `Notification`, `AuditLog` (category `announcements`).

## Endpoints
Base `/api/v1`. All need a bearer token.

| Method | Route | Who | Response |
| --- | --- | --- | --- |
| GET | `/announcements` | anyone, scoped (see below) | page; `?status&audience&priority&sort&order&page&limit` (status and audience filters are staff-only) |
| GET | `/announcements/:id` | anyone who may see it | one announcement |
| POST | `/announcements` | `announce` (Admin, Manager, Compliance) | the announcement; `publish: true` publishes at once |
| PATCH | `/announcements/:id` | `announce` | the draft, edited |
| POST | `/announcements/:id/publish` | `announce` | the published announcement; notifies the audience |
| POST | `/announcements/:id/archive` | `announce` | the archived announcement |
| POST | `/announcements/:id/ack` | a client | acknowledges (safe to repeat) |
| GET | `/announcements/:id/acks` | `announce` | who has and hasn't acknowledged |

## Who sees what
Staff with `announce`: all, including drafts and archived. A CSR: published and unexpired (what their clients see). A client:
published, unexpired, addressed to everyone or to them, with their own acknowledgement state. Anything else is a 404.

## Rules
- Only a **draft** can be edited (`ANNOUNCEMENT_NOT_DRAFT`: a published one may already have been read; archive it and publish a new one).
- Archive needs a published announcement (`ANNOUNCEMENT_NOT_PUBLISHED`).
- Expiry is judged by the **server's date**, never one sent by the caller; an expiry in the past is refused (`ANNOUNCEMENT_EXPIRY_PAST`).
  An expired announcement disappears from client lists without changing its status.
- Audience: everyone, or one existing, active client (`ANNOUNCEMENT_AUDIENCE_INVALID`).
- Acknowledging needs `requiresAck` (`ANNOUNCEMENT_ACK_NOT_REQUIRED`) and a client the announcement is for.
- Publishing creates in-app notifications for the audience and emails per each person's preference.

## Tests
`test/announcements.e2e-spec.ts`: lifecycle, visibility per role, expiry by server date, acknowledgements, notifications.
