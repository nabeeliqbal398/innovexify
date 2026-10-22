# Messages module

## Purpose
The conversation between a client and their team: one shared thread per client. A client reads and writes only their own; a CSR
only their assigned clients'; Admin, Manager and Compliance every client's (the `conversation` permission). Messages are
immutable: there is no edit and no delete.

## Database models
`Message` (`clientId`, `senderId`, `text`, `attachmentName/Key/Mime/Size`, `createdAt`), `ConversationRead` (per person and
client: messages up to `readAt` count as read), `Notification`, `AuditLog` (category `messages` for attachment downloads).

## Endpoints
Base `/api/v1`. All need a bearer token.

| Method | Route | Who | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/clients/:clientId/messages` | `conversation`, scoped | `?limit&before&since` | messages, cursor meta |
| POST | `/clients/:clientId/messages` | `conversation`, scoped; rate-limited | JSON `{ text }` or multipart (`text`, file in `file`) | the message |
| POST | `/clients/:clientId/messages/read` | `conversation`, scoped | none | confirmation ("Marked as read.") |
| GET | `/conversations` | any signed-in staff or client | `?page&limit` | page of conversations, unread first |
| GET | `/messages/unread-count` | any signed-in | none | `{ unread }` |
| GET | `/messages/:id/attachment` | same scope as the conversation | none | the file (attachment disposition) |

Cursor paging: newest page by default; `before=<message id or ISO time>` walks to older messages; `since=<id>` returns only newer
ones (for polling). Both at once is refused. `meta` is `{ limit, hasMore, nextBefore, newest }`. Limit 1 to 100 (default 30), with a
message on the field when out of range.

## Business rules
- **Text:** 1 to 5000 characters after trimming; an attachment may go with it or alone.
- **Attachments:** the same file policy as documents (type by content, size cap, scan). A CSR can't attach to a client conversation
  (`attachStaff`, refused and audited). Downloads are scoped like the conversation and audited; the storage key is never returned.
- **Read-only threads:** a suspended client's conversation can be read but not written to (`CONVERSATION_READ_ONLY`, naming the
  client and the reason); a removed client's likewise.
- **Rate limit:** `MESSAGE_RATE_LIMIT_PER_MIN` (default 30) per person per minute; over it is 429 with the seconds to wait.
  In memory per instance; swap for a shared store with several instances (see `src/common/SPECS.md`).
- **Notifications:** the other side gets an in-app notification (link `messages` for staff, `cmsgs` for the client). The email
  follows the recipient's preference and the `msg` trigger: a switched-off trigger stops the email, never the in-app one.
- **Unread:** counted in SQL from `ConversationRead`, scoped; sending marks your own side read.
- A conversation outside the caller's scope is a 404 (same body as a missing one) on every route.

## Tests
`test/messages.e2e-spec.ts`: scoping per role, cursor walking and validation, attachments, read-only threads, rate limit, unread
counts, notifications and email suppression.
