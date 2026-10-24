# Auth module

## Purpose
Sign-in, session tokens, the invitation flow that turns an invited person into an active user, and password reset by email.
It also owns the two global guards (`JwtAuthGuard`, `RolesGuard`) that protect every other module.

## Database models
`User` (passwordHash, status, failedLoginCount, lockedUntil, lastLoginAt), `RefreshToken`, `InvitationToken`,
`PasswordResetToken`, `AuditLog`, `Notification`. Only SHA-256 hashes of refresh, invitation and password-reset tokens are stored;
passwords are Argon2id.

## Endpoints
All paths are under `/api/v1`. Every response uses the standard envelope.

| Method | Route | Auth, limit | Request | Response `data` |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | public, 5/min per address **and email** | `{ email, password }` | `{ accessToken, expiresIn, refreshToken, user }` |
| POST | `/auth/refresh` | public, `REFRESH_THROTTLE_LIMIT` (120)/min per address | `{ refreshToken }` | new `{ accessToken, expiresIn, refreshToken, user }` |
| POST | `/auth/logout` | public, 120/min per address (same limit as refresh) | `{ refreshToken }` | `null` (idempotent) |
| POST | `/auth/logout-all` | bearer | none | `{ sessionsEnded }` |
| POST | `/auth/change-password` | bearer, 5/min per address | `{ currentPassword, newPassword }` | `{ otherSessionsEnded }` |
| GET | `/auth/me` | bearer | none | `{ id, email, name, role, status, clientProfile }` |
| GET | `/auth/invitations/:token` | public, 5/min per address | none | `{ email, name, role, caseNumber, invitedBy, expiresAt }` |
| POST | `/auth/accept-invitation` | public, 5/min per address | `{ token, password }` | session, same as login |
| POST | `/auth/forgot-password` | public, 5/min per address **and email** | `{ email }` | `null`, always the same message |
| GET | `/auth/reset-password/:token` | public, 5/min per address | none | `{ expiresAt }` |
| POST | `/auth/reset-password` | public, 5/min per address | `{ token, password }` | `{ sessionsEnded }` (no session is opened) |

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
  `LOGIN_LOCKOUT_MINUTES` (15). A locked account is refused even with the right password. On top of that, the secret-guessing
  routes (sign-in, accept-invitation, invitation and reset lookups, password change and reset) allow `AUTH_THROTTLE_LIMIT` (5)
  requests per minute.
- **What a rate limit counts (the limit key):**
  - `/auth/login` and `/auth/forgot-password`: the client address **plus the normalised email** (trimmed, lower-case), so one
    attacking address uses up only its own attempts at one mailbox and cannot lock everyone out, and an office behind one
    shared (NAT) address does not share one bucket between its people. Per-account lockout (above) still protects the account
    itself, whatever address the guesses come from.
  - `/auth/accept-invitation`, the lookups, `/auth/change-password`, `/auth/reset-password`: the client address.
  - `/auth/refresh` and `/auth/logout`: the client address, at `REFRESH_THROTTLE_LIMIT` (default 120/min). A page load renews
    the access token, so reloading or a busy office legitimately makes many calls; a refresh token is 384 random bits, so
    guessing it is not what this limit is for. (Before this setting the refresh route shared the 5/min sign-in limit and the
    sixth reload in a minute from one address got a 429: `test/rate-limits.e2e-spec.ts` pins the fix.)
  - **The client address** is `request.ip`. With `TRUST_PROXY=false` (default) that is the socket address and
    `X-Forwarded-For` is ignored. With `TRUST_PROXY=N` it is the entry N hops from the right of `X-Forwarded-For`, so entries a
    client writes itself are never believed. `TRUST_PROXY=true` means 1. Count the reverse proxies you run in front of the stack that add the
    client's address (nginx with `$proxy_add_x_forwarded_for`, Caddy). The web app's own `/api` rewrite adds **nothing**: it forwards
    `X-Forwarded-For` as it received it, so it is not a hop (verified against the running stack). Too low and everyone shares one address
    bucket; too high and a client can pick its own, so `1` without a reverse proxy that writes the header lets any caller dodge the limits.
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
- **Password reset:** `POST /auth/forgot-password` answers `200` with the same message and body whether the email is unknown,
  belongs to a suspended, removed or not-yet-accepted account, or is a real active one. Only an **active** account gets a link:
  a random 48-byte token, stored as a SHA-256 hash, valid `PASSWORD_RESET_TTL_MINUTES` (30), single use; a newer link retires
  the older ones, and asking again inside a minute sends nothing new. Every path generates a token, queries the database and
  writes an audit entry (`Password reset requested`, or a refused one with `ok: false`), and the email is handed to the mail server
  after the answer is ready, so neither the SMTP latency nor an SMTP failure tells the paths apart (timing is not otherwise
  equalised and is not asserted). `POST /auth/reset-password` looks the token up by hash and compares it in constant time, then
  in **one transaction** burns the link, sets the Argon2id hash, clears the failed-login counter and lock, retires the person's other
  reset links and **revokes every refresh-token family**; it then writes an audit entry (`Password reset completed; N sessions ended`)
  and sends a "your password was changed" email. That email is a security notice: it is always sent (not one of the switchable
  notifications) and a mail failure is logged, not surfaced, because the password has already changed. No session is opened:
  the person signs in with the new password. An already-issued access token keeps working until it expires (at most
  `JWT_ACCESS_TTL_SECONDS`, 15 minutes), as it does after `logout-all`.
  Errors: unknown token, or an account that is no longer active, `PASSWORD_RESET_INVALID` 404 (the two look the same); used
  `PASSWORD_RESET_USED` 409; expired `PASSWORD_RESET_EXPIRED` 410; weak password `VALIDATION_FAILED` 422 on `password`,
  and the link stays usable.
- **Password policy:** 12 to 128 characters with upper and lower case letters and a number (same as the sign-up form).
- **Audit:** every sign-in, refusal, lockout, reuse detection, sign-out, accepted invitation and password reset request or completion is written to
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
`INVITATION_USED` 409, `PASSWORD_RESET_INVALID` 404, `PASSWORD_RESET_EXPIRED` 410, `PASSWORD_RESET_USED` 409, `VALIDATION_FAILED` 422, `TOO_MANY_REQUESTS` 429, `PERMISSION_DENIED` 403.
