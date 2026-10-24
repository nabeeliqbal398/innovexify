# Staging checklist

Run this on a staging copy that is built and configured **exactly like production** (same images, `NODE_ENV=production`, the same reverse proxy and `TRUST_PROXY`, real SMTP to a mailbox you control).
A pass here is what "ready for the first real client" means in `GO-LIVE.md`. Use throw-away people (`name+admin@yourdomain`, `name+csr@yourdomain`, ...) so every email reaches you.

Staging data is disposable. Never copy production data into staging, and never point staging at production's database, uploads or SMTP credentials.

## A. Set it up (exact steps)

1. `Copy-Item .env.example .env` and fill it in: `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`), `APP_URL` (the staging address, **https**), the five `SMTP_*`/`MAIL_FROM` values, and `TRUST_PROXY` (`1` behind one reverse proxy that sets `X-Forwarded-For`, `false` with none). `VIRUS_SCANNER=clamav` too if production will use it.
2. `docker compose up -d db`, then migrate: `docker compose run --rm -e MIGRATE_ON_START=false api node node_modules/prisma/build/index.js migrate deploy`.
3. `docker compose up -d --build`. **Expected:** `docker compose ps` shows `db`, `api` and `web` healthy. (Without the SMTP values the api container exits at start-up and names what is missing.)
4. First Admin: `docker compose exec -e ADMIN_EMAIL=you+admin@yourdomain -e ADMIN_NAME="Staging Admin" -e ADMIN_PASSWORD='<a long, unique passphrase>' api npm run admin:create`. **Expected:** "Created the Admin ...". Running it again prints "An Admin already exists".
5. Catalog: `docker compose exec api npm run bootstrap:catalog`. **Expected:** "Service catalog: 10 added, 0 already there, 0 edited and left alone." Run it again: "0 added, 10 already there".
6. Check the proxy setting: sign in as the Admin and open `GET /api/health/detail` (for example with the browser dev tools, or `curl -H "Authorization: Bearer <token>"`). **Expected:** `client.ip` is **your** public address, `client.trustProxy` is the value you set, `mail.configured` is `true`. If `client.ip` is the proxy's address, `TRUST_PROXY` is too low (`GO-LIVE.md` item 2).
7. `GET /api/health/ready` (no sign-in). **Expected:** `200` and `"status":"ok"` with all four checks `ok`.
8. `docker compose exec` is not needed from here: everything else is done in the browser as the people below. Invite **one person per role** with your plus-addresses: a Manager, two CSRs (CSR 1, CSR 2), a Compliance user, and a Client assigned to CSR 1 (`name+client@...`). Accept each invitation from its email. Keep six browser profiles (or private windows): Admin, Manager, CSR 1, CSR 2, Compliance, Client.

## B. The 30 manual tests

Mark each pass or fail and write down the time and the request id (`requestId` in an error toast) for any failure. "Expected" is what must happen; anything else is a failure to report, not to work around.

### Sign-in and accounts (all roles)

| # | Role | Steps | Expected |
| --- | --- | --- | --- |
| 1 | Admin | Open the site, sign in with the Admin email and password. | Lands on **Overview** (`/admin/overview`); "Signed in as" shows the name; no console errors. |
| 2 | Each of Manager, CSR 1, Compliance, Client | Sign in in their own window. | Each lands on their own first screen (`/manager/overview`, `/csr/overview`, `/compliance/overview`, `/client/home`) and sees only their own navigation. |
| 3 | Any | Sign in with a wrong password five times for one email, then a sixth time (even with the right password). | The first five say the email and password don't match; after the fifth the account is locked for 15 minutes and the sixth attempt says so. A different email from the same machine is not affected. |
| 4 | Client | Type a role URL that is not theirs, such as `/admin/overview`. | "This page doesn't exist". Nothing from the Admin workspace is shown. |
| 5 | Any | Reload the page 10 times in a minute. | Always stays signed in; no "too many requests". |

### Invitations (Admin, Manager, CSR)

| # | Role | Steps | Expected |
| --- | --- | --- | --- |
| 6 | Admin | **Staff & Invitations** → invite a new CSR (CSR 3) with a plus-address. | "Invitation sent"; the person appears under **Pending invitations**; an email arrives with a link on the staging address, valid 7 days. |
| 7 | New person | Open the link, set a password that breaks the rules, then a good one. | Rules are shown live; the form refuses the weak password with the reason; the good one creates the account and signs in. |
| 8 | New person | Open the same invitation link again in another browser. | "You've already set up your account" with a link to sign in. |
| 9 | CSR 1 (or Manager) | **My Clients** / **Clients** → invite a client (Client 2) with a plus-address. | The client is created at the first stage of their case, assigned to CSR 1; the invitation email arrives; the CSR is notified when it is accepted. |
| 10 | Admin | Re-send an invitation, then use the **old** link. | The old link says it has expired; the new one works. |

### Documents (Compliance, Client, CSR, Manager)

| # | Role | Steps | Expected |
| --- | --- | --- | --- |
| 11 | Compliance | **Document Requests** → request "Proof of address" from the Client. | A request appears; the Client gets an in-app notification (and an email if their preference is on). Requesting the same open document again is refused with a clear message. |
| 12 | Client | **Documents** → upload a real PDF to that request. | "uploaded for review"; status **Uploaded · under review**; the file name is shown. |
| 13 | Client | Upload a `.exe` renamed to `.pdf`, then a file over the size limit. | Both are refused with a specific message (the first says the contents are not a PDF, PNG, JPG or DOCX whatever the name says; the second says the file is too large and the limit); nothing appears in the list. |
| 14 | Compliance | **Document Review** → preview the upload; download it. | The preview opens in the page; the downloaded file is byte-for-byte the one uploaded (compare checksums). |
| 15 | Compliance | Reject it with a reason, then (after the Client replaces it) approve it. | The Client sees "Needs correction: <reason>" and can replace the file; after approval the status is **Approved**; every decision is in the review history. |
| 16 | CSR 1 | Try to open the Client's document (the **Documents** area is not in a CSR's navigation; also try the direct address `/csr/documents`). | Not available; the CSR sees only that a document is required, awaiting review, approved or needs correction, never its contents. |
| 17 | CSR 2 | Open the Client's profile by its address. | "Not found": CSR 2 is not assigned to this client. |

### Messages, tickets, announcements (several roles)

| # | Role | Steps | Expected |
| --- | --- | --- | --- |
| 18 | Client | **Messages** → send a message to the team. | It appears at once for the Client; CSR 1 sees it (unread count) and can reply; the reply appears for the Client. |
| 19 | Client | Attach a file to a message, send 31 messages in a minute. | The attachment is checked like an upload; the 31st says "too quickly" with how long to wait. |
| 20 | Client | **Home → Ticket center**: open a new ticket. | The ticket gets a number (TKT-n) and shows for staff under **Tickets**. |
| 21 | CSR 1 / Manager | Move the ticket In Progress, then Resolved. | The Client sees each status; after Resolved the Client can reopen it within the reopen window and not after. |
| 22 | Admin | **Announcements** → publish one for all clients, high priority. | Clients see it and can acknowledge it; staff see who has acknowledged. |

### Passwords and sessions

| # | Role | Steps | Expected |
| --- | --- | --- | --- |
| 23 | Client | Sign out. On the sign-in page choose **Forgot password?**, enter the email. | The page says an email is on its way (the same words for any address); the email arrives within a minute with a link valid 30 minutes. |
| 24 | Client | Ask again straight away; then open the link, set a new password; open the link a second time. | The second request sends no second email (one a minute); the new password is accepted and every device is signed out; the second visit says the link was already used; an unknown email gets the same page and **no** email. |
| 25 | Client | Sign in on two devices, then **Settings → Sign out everywhere** on one. | The other device is signed out at its next request (within 15 minutes at the latest) and its refresh no longer works; this one is sent to sign-in. |
| 26 | Admin | **Staff & Invitations** → suspend CSR 3. Then CSR 3 tries to sign in; then CSR 3 asks for a password reset. | Sign-in says the account is suspended; the reset page gives the same answer as for any email and **no email** arrives. Re-activating restores sign-in. |

### Audit, analytics, system

| # | Role | Steps | Expected |
| --- | --- | --- | --- |
| 27 | Admin | **Audit & Security**: find the sign-ins, the wrong passwords, the lockout, the invitation, the upload, the review, the password reset and the suspension from the tests above; export CSV. | Each action is listed with who, when, address and result (refusals marked); the CSV opens and matches. Managers, CSRs, Compliance and Clients cannot open this screen. |
| 28 | Admin / Manager | **Reports & Analytics**: pick a range, change it, reload. | Numbers match what you did (clients, cases by stage, documents); a range over 24 months is refused with a message; figures may lag up to a minute (cache). |
| 29 | Admin | **Settings**: change the company name and upload a PNG logo; try an SVG. | The name and logo show in every workspace and in new emails; the SVG is refused with the reason. |
| 30 | Admin | Sign in, then **Sign out everywhere** from **Audit & Security**; reload each of the other windows. | Every window ends up on the sign-in page with "Your session ended"; signing in again works. |

## C. Before you call it done

- `GET /api/health/ready` is `ok`, and the uptime monitor is pointed at it.
- `bash scripts/backup.sh` produces a dump and an uploads archive; restore them into a scratch database following `scripts/RESTORE.md` and compare row counts.
- `docker compose logs api | findstr /i "password token eyJ"` shows nothing secret (invitation and reset links appear as `[REDACTED]`).
- `GET /api/docs` and `GET /api/docs-json` are 404.
- Every failure is written down with its request id. Fix it on a branch and run this list again from step A.5; do not start real clients with an open failure.
