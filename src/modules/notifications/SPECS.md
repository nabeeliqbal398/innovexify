# Notifications module (in-app)

## Purpose
The signed-in person's own notification list. Other modules create notifications (messages, tickets, documents, announcements,
stage changes); this module only reads, marks and deletes the caller's own.

## Database models
`Notification` (`userId`, `text`, `link`, `readAt`, `createdAt`). The module class is `UserNotificationsModule`
(`NotificationService` in `src/common` is the writer and the email gate).

## Endpoints
Base `/api/v1`. All need a bearer token.

| Method | Route | Response |
| --- | --- | --- |
| GET | `/notifications` | newest first by cursor (`?limit&before&since&unread=true`) |
| GET | `/notifications/unread-count` | `{ unread }` |
| POST | `/notifications/read-all` | `{ updated }` |
| POST | `/notifications/:id/read` | the notification (first reading time is kept) |
| DELETE | `/notifications/:id` | the deleted notification |

## Rules
- **Ownership:** every query is `WHERE userId = caller`. Someone else's id is a 404, the same body as a missing one, and nothing changes.
  `read-all` only touches the caller's own.
- **Links are view names, never URLs.** What is stored comes from the allowlist in `common/notifications/notification-links.ts`; what
  is returned is re-checked (`safeLink`), so an old or hand-written row such as `https://evil.example` or `javascript:` comes back as `""`.
- **Cursor:** `before` and `since` take a notification id or an ISO time; another person's id as a cursor is a 422 on the field.
- Preferences and triggers control **email** only; an in-app notification is always created.

## Tests
`test/notifications.e2e-spec.ts`.
