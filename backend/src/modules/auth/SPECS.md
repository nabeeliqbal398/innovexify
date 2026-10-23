# Auth module

## Purpose
Sign-in, session tokens, and the invitation flow that turns an invited person into an active user. It also owns the
two global guards (`JwtAuthGuard`, `RolesGuard`) that protect every other module.

## Database models
`User` (passwordHash, status, failedLoginCount, lockedUntil, lastLoginAt), `RefreshToken`, `InvitationToken`,
`AuditLog`, `Notification`. Only SHA-256 hashes of refresh and invitation tokens are stored; passwords are Argon2id.

## Endpoints
All paths are under `/api/v1`. Every response uses the standard envelope.

| Method | Route | Auth | Request | Response `data` |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | public, 5/min | `{ email, password }` | `{ accessToken, expiresIn, refreshToken, user }` |
| POST | `/auth/refresh` | public, 5/min | `{ refreshToken }` | new `{ accessToken, expiresIn, refreshToken, user }` |
| POST | `/auth/logout` | public, 5/min | `{ refreshToken }` | `null` (idempotent) |
| POST | `/auth/logout-all` | bearer | none | `{ sessionsEnded }` |
| GET | `/auth/me` | bearer | none | `{ id, email, name, role, status, clientProfile }` |
| GET | `/auth/invitations/:token` | public, 5/min | none | `{ email, name, role, caseNumber, invitedBy, expiresAt }` |
| POST | `/auth/accept-invitation` | public, 5/min | `{ token, password }` | session, same as login |

`GET /api/health` is version-neutral and public (database check, 503 when the database is down).

## Business rules
- **Access token:** HS256 JWT `{ sub, role }`, lifetime `JWT_ACCESS_TTL_SECONDS` (default 15 min). The guard reloads the
  user on every request, so a suspended or removed account is cut off at once.
- **Refresh tokens:** random 48 bytes, single use, grouped in a *family* created at sign-in. Using one retires it and
  issues a replacement in the same family (`replacedById` set, in one transaction).
- **Reuse detection:** presenting a token that was already rotated means it was replayed or leaked, so the whole family
  is revoked and the caller gets `TOKEN_REUSE_DETECTED`. A token ended by logout is simply invalid
  (`TOKEN_INVALID`), not an attack. Two parallel refreshes with the same token are treated as reuse.
- **Brute-force protection:** `LOGIN_MAX_ATTEMPTS` (5) consecutive failures lock the account for
  `LOGIN_LOCKOUT_MINUTES` (15). A locked account is refused even with the right password. On top of that, auth routes
  allow 5 requests per minute per client.
- **No account discovery:** unknown email and wrong password return the same message and take the same time (a dummy
  Argon2 verification runs for unknown emails).
- **Invitations:** a link works once, until `INVITATION_TTL_DAYS` (7). Accepting sets the password, activates the
  account (clients also get `joinedAt`), burns the token and signs the person in, atomically. The assigned CSR is
  notified. `InvitationService.issue(userId, tx?)` creates a link and retires earlier unused ones;
  `issueAndSend(...)` also emails it through `MailService`; `sendInvitation(...)` emails a link that was already issued.
  The users module sends inside its transaction (a failed email rolls the invitation back); the clients module issues the
  link inside its transaction and sends after the commit, so a mail outage never undoes a created client.
- **Refresh cookie:** `httpOnly`, path `/api/v1/auth`. `SameSite` comes from `REFRESH_COOKIE_SAMESITE` (`strict` default, `lax`,
  `none`). `Secure` is always on in production, and elsewhere with `REFRESH_COOKIE_SECURE=true`. `none` is **rejected at
  startup** unless the cookie is Secure, because browsers drop an insecure `SameSite=None` cookie.
- **Password policy:** 12 to 128 characters with upper and lower case letters and a number (same as the sign-up form).
- **Audit:** every sign-in, refusal, lockout, reuse detection, sign-out and accepted invitation is written to
  `AuditLog` (category `auth`) with request id and IP.

## Validation rules
Email: valid, trimmed, lower-cased, at most 254 characters. Password: required, at most 128. Tokens: 32 to 256
characters. Unknown body fields are rejected (`forbidNonWhitelisted`).

## Edge cases handled
Unknown email; wrong password; locked account; suspended, removed or still-invited account; expired, already-rotated,
logged-out and revoked refresh tokens; refresh race between two tabs; logout with an unknown token; expired, used,
invalid and double-submitted invitations; weak passwords; deleted user with a valid access token; request with no or
malformed `Authorization` header; secrets in logs (redacted).

## Error codes
`INVALID_CREDENTIALS` 401, `ACCOUNT_LOCKED` 429, `ACCOUNT_INACTIVE` 403, `UNAUTHENTICATED` 401, `TOKEN_EXPIRED` 401,
`TOKEN_INVALID` 401, `TOKEN_REUSE_DETECTED` 401, `INVITATION_INVALID` 404, `INVITATION_EXPIRED` 410,
`INVITATION_USED` 409, `VALIDATION_FAILED` 422, `TOO_MANY_REQUESTS` 429, `PERMISSION_DENIED` 403.
