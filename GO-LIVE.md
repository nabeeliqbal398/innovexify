# Go-live checklist

What stands between "it works on a laptop" and "real clients use it". Each item says whether it is **Done in code**, **Needs infrastructure**
(someone must set something up outside the code) or **Needs a decision** (the business must choose), then the exact steps.

| # | Item | Status |
| --- | --- | --- |
| 1 | HTTPS and the reverse proxy rule | Needs infrastructure |
| 2 | Real client address behind the proxy (`TRUST_PROXY`) and the rate limits | Done in code, needs configuration (the default is the safe one) |
| 3 | Refresh cookie: `SameSite` and `Secure` | Done in code (flags tested in production mode) |
| 4 | Secrets and their rotation | Needs infrastructure |
| 5 | The first Admin account (no seed data in production) | Done in code (the seed refuses production, with no override) |
| 6 | Email delivery (SMTP) and password-reset links | Done in code, needs a mail provider and DNS |
| 7 | Malware scanning of uploads (ClamAV) | Done in code, needs infrastructure |
| 8 | Encryption at rest and backups | Backup and restore scripts done; schedule, encryption and an off-site copy need infrastructure |
| 9 | Retention of audit logs and uploads | Needs a decision |
| 10 | Redis for the analytics cache and rate limits (more than one instance) | Needs infrastructure |
| 11 | Log shipping | Needs infrastructure |
| 12 | Uptime monitoring of `/api/health/ready` | Endpoint done; the monitor needs infrastructure |
| 13 | Migrations as a separate release step | Done in code, needs a pipeline |
| 14 | Rollback plan | Needs a decision |
| 15 | Password reset by email (done) and two-factor sign-in | Reset done in code; two-factor needs a decision (not built) |
| 16 | Seed data and demo tooling off | Done in code |
| 17 | Security headers, CORS, API docs, dependency and secret scanning | Done in code and CI; read the open points |

---

## 1. HTTPS and the reverse proxy rule (Needs infrastructure)

The browser must only ever talk to **one origin**. The web app is a Next.js server; it forwards `/api/*` to the API itself (`next.config.mjs`), so with
the compose file the only published port is the web app's. In production put an HTTPS reverse proxy in front of it and terminate TLS there.

Caddy (automatic certificates):

```
crm.example.com {
    encode zstd gzip
    # Everything, including /api, goes to the web app, which proxies /api to the API on the private network.
    reverse_proxy web:3000
}
```

nginx, if you would rather send `/api` straight to the API and skip Next's hop:

```
server {
    listen 443 ssl http2;
    server_name crm.example.com;
    # ssl_certificate / ssl_certificate_key from your CA
    client_max_body_size 30m;                       # MAX_UPLOAD_MB plus the form overhead

    location /api/ {
        proxy_pass http://api:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
    location / {
        proxy_pass http://web:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server { listen 80; server_name crm.example.com; return 301 https://$host$request_uri; }
```

Then:
1. Set `APP_URL=https://crm.example.com` in `.env` (invitation links are built from it) and `docker compose up -d --build`.
2. Close ports 4000 and 5432 to the internet (the compose file does not publish them; keep your firewall the same).
3. The web app already sends `Strict-Transport-Security: max-age=63072000; includeSubDomains` in production, and the API sends its own. A browser only honours it over HTTPS, so there is
   nothing to add at the proxy; do not turn on HSTS `preload` until you are sure every subdomain will be HTTPS for good.
4. If you build the web image by hand, remember the `/api` rewrite is read **when Next builds**: pass `--build-arg API_ORIGIN=http://api:4000`.

## 2. Real client address (`TRUST_PROXY`) and the rate limits (Done in code, needs configuration)

**What is limited, and per what** (details in `backend/src/modules/auth/SPECS.md`):

| Route | Limit | Counted per |
| --- | --- | --- |
| `POST /auth/login`, `POST /auth/forgot-password` | `AUTH_THROTTLE_LIMIT` = 5 a minute | client address **and email** (trimmed, lower-case) |
| `POST /auth/accept-invitation`, the invitation and reset lookups, `change-password`, `reset-password` | 5 a minute | client address |
| `POST /auth/refresh` | `REFRESH_THROTTLE_LIMIT` = 120 a minute, plus a backstop `REFRESH_IP_CEILING` = 1200 a minute | **session** (refresh-token family), and client address for the ceiling |
| `POST /auth/logout` | `REFRESH_IP_CEILING` = 1200 a minute | client address |
| everything else | `THROTTLE_LIMIT` = 100 a minute | client address |

Why it is split this way: the page load renews the access token with `/auth/refresh`, so the old shared limit of 5 a minute meant the sixth reload in a minute from one address got a
429 (and a flat per-address 120 would still lock out a large office, so refresh is now counted per session: `backend/test/proxy-and-refresh.e2e-spec.ts` has 200 people behind one address all renewing) (`backend/test/rate-limits.e2e-spec.ts` reproduces it and pins the fix). Sign-in is counted per address **and** email so one attacker address cannot use up everyone's sign-ins, and an
office behind one shared address does not share one bucket. The per-account lockout (`LOGIN_MAX_ATTEMPTS`, 15 minutes) is unchanged and still stops one account being guessed from many addresses.
Known limit: one address trying one wrong password against many *different* emails is bounded only by the global 100 a minute; the lockout does not see it. Put a rate limit at the proxy
(for example nginx `limit_req` on `/api/v1/auth/login`) if that matters to you.

**`TRUST_PROXY` is a number of proxies, not a switch.** The client address is read from `X-Forwarded-For`, counting that many entries from the right, so entries a caller writes themselves
(on the left) are never believed. `false` (the default) ignores the header and uses the address of whatever connected to the API; `true` means 1.

**The web app's `/api` proxy adds nothing to `X-Forwarded-For`**: it passes the header on exactly as it received it (the stack test below sent a made-up header straight to port 3000 and the API
saw the made-up value). So it does not count as a hop, and the number to set is the number of *reverse proxies you run in front of the stack* that add the real client address:

| Layout | `TRUST_PROXY` | Why |
| --- | --- | --- |
| The web port (3000) reachable directly, no reverse proxy (a trial, a LAN) | `false` (the compose default) | Nothing in front vouches for the header. Every caller then shares one address bucket; sign-in is still counted per email, so this only means a coarser refresh limit |
| Caddy, or nginx with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, in front of the web app (item 1) | `1` | That proxy writes the real address as the last entry |
| nginx sending `/api` straight to the API (the second sample in item 1) | `1` | Same |
| Two reverse proxies that each append (a CDN, then nginx) | `2` | One entry each |

Too low and everybody shares one address bucket; too high and a caller can choose their own. **Never set `1` without a reverse proxy that writes the header**, and make sure ports 3000 and 4000 are
reachable only through it. **Check after deploy with `GET /api/health/detail` (Admin).** Its `client` block shows what the server sees for *your* request: `ip` should be your own address (not the proxy's) and `trustProxy` the value you meant
(`socketAddress` is always the proxy). If `ip` is the proxy's address, the value is too low; if it changes when you send your own `X-Forwarded-For` header straight to the API, it is too high or the
port is exposed. `backend/test/proxy-and-refresh.e2e-spec.ts` shows both outcomes behind a fake proxy: with `false`, 200 users with different forwarded addresses share one bucket; with `1`, they do not.
Also: 6 wrong passwords for one email from your machine are refused on the sixth while a different email is not; then send the same wrong password for one email
with a made-up header each time (`curl -H "X-Forwarded-For: 1.2.3.$i" ...`): the sixth must still be refused. The stack test recorded in item 17 does exactly this.

## 3. Refresh cookie (Done in code)

The refresh token is an `httpOnly` cookie on path `/api/v1/auth`. `Secure` is always on when `NODE_ENV=production`. `SameSite=Strict` is the default
(`REFRESH_COOKIE_SAMESITE`) and works because the app and the API share an origin. Do not move the API to another site: `SameSite=None` is refused at
start-up unless the cookie is `Secure`, and it would reopen cross-site request risk. `ALLOW_BODY_REFRESH` must stay `false` (it returns the refresh token in
JSON, for non-browser clients only).

## 4. Secrets and rotation (Needs infrastructure)

| Secret | Where | Rotate |
| --- | --- | --- |
| `JWT_ACCESS_SECRET` | `.env` / secret store | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Replace and restart: everyone's 15-minute access token stops working and refreshes silently, so nobody is signed out. Do it every 6 to 12 months and after any suspected leak. |
| `POSTGRES_PASSWORD` | `.env` / secret store | `ALTER USER innovexify PASSWORD '...'` in the database, update `.env`, restart the API. |
| `SEED_PASSWORD` | development `.env` only | **Never set in production.** `prisma/seed.ts` refuses to run when `NODE_ENV=production`, with no override. |
| `SMTP_PASSWORD` | `.env` / secret store | Create a new credential at the mail provider, update, restart the API, then revoke the old one. |

Keep `.env` out of git (it is ignored), out of images (`.dockerignore`), and in a secret manager (Docker/Kubernetes secrets, a cloud vault) rather than on disk when you can.

## First run on an empty production database: the exact order

Do these in this order, once. Each step is safe to repeat. Run them from the folder with `docker-compose.yml` and a filled-in `.env`.

```
# 1. Create the tables (the API container does this itself on start when MIGRATE_ON_START is true; do it explicitly first if you set it to false)
docker compose up -d db
docker compose run --rm -e MIGRATE_ON_START=false api node node_modules/prisma/build/index.js migrate deploy
docker compose up -d --build                       # api and web; the api refuses to start without the SMTP settings (item 6)

# 2. The first Admin (refuses if an Admin already exists)
docker compose exec -e ADMIN_EMAIL=owner@yourcompany.com -e ADMIN_NAME="Olive Owner" -e ADMIN_PASSWORD='<a long, unique passphrase>' api npm run admin:create

# 3. The default service catalog (inserts only; refuses to overwrite a service someone edited; creates no clients, tasks or documents)
docker compose exec api npm run bootstrap:catalog
```

4. **Then the Admin signs in and invites staff** from **Staff & Invitations** (a second Admin first, then Managers, CSRs, Compliance). Clients are invited by their CSR or a Manager once the catalog exists.

`bootstrap:catalog` prints how many services it added, how many were already there and how many were edited and left alone. Run it again after an upgrade that adds services and it
adds only the new ones. Order matters: inviting a client before step 3 fails with "We couldn't find the service \"llc\"". The development seed is **not** part of this (it refuses production).

## 5. The first Admin account (Done in code)

Production has no seed data. **`prisma/seed.ts` refuses to run when `NODE_ENV=production`** and there is no switch to override it (`backend/src/cli/seed-guard.spec.ts` runs the real file and checks the refusal),
so the demo accounts and their shared password can never reach a production database by accident. The owner is created once, with the command that exists for that, from the API container:

```
docker compose exec -e ADMIN_EMAIL=owner@yourcompany.com -e ADMIN_NAME="Olive Owner" -e ADMIN_PASSWORD='<a long, unique passphrase>' api npm run admin:create
```

(`npm run admin:create` runs `node dist/cli/create-admin.js` from the build.) It refuses if an Admin already exists, if the password breaks the policy (12 to 128 characters, upper and lower case, a number) or if
the email is taken, hashes the password with Argon2id and writes "Created the first Admin account" to the audit log. Sign in, then invite everyone else from **Staff & Invitations**, and create a second Admin
(the last active Admin cannot be suspended or removed). The command line stays in your shell history: use a long one-off password and change it from **Settings** after signing in, or, if you forget it, use
**Forgot password?** (item 6) once email works.

**First-run catch (handled by `npm run bootstrap:catalog`, see the first-run order above):** a fresh production database has **no services** (the demo catalog comes from the seed). Inviting a client defaults to the service `llc`, so the first invitation fails with
"We couldn't find the service "llc"" until an Admin adds one under **Services** (`POST /services`; its id is made from the name, so a service called `LLC` gets the id `llc`). Add your real catalog
before inviting anyone.

## 6. Email delivery and password reset (Done in code, needs a mail provider and DNS)

Email leaves through SMTP (`MAIL_TRANSPORT=smtp`). Set all five in `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` (for example `Innovexify <no-reply@your-domain.com>`).
**The API will not start in production without them, and it refuses `MAIL_TRANSPORT=log`** (which only writes emails, links included, to the log) when `NODE_ENV=production`. Port 465 is encrypted from the first
byte; any other port must upgrade with STARTTLS (`SMTP_ALLOW_PLAINTEXT=true` is for a relay on a private network only). Use a provider's SMTP relay (SES, Postmark, SendGrid, your mail host) and set up SPF, DKIM
and DMARC for the sending domain, or messages land in spam.

What is sent: invitations, notifications, the **password-reset link** (works once, 30 minutes, `PASSWORD_RESET_TTL_MINUTES`) and the **"your password was changed" notice** (always on: it is a security notice, not a
notification a person can switch off). The sign-in page has **Forgot password?**: the answer is the same whether or not the email has an account, only active accounts get a link, a suspended or removed account gets
nothing, and finishing a reset ends every session. After a reset, an access token already issued lives at most 15 minutes (`JWT_ACCESS_TTL_SECONDS`), as it does after "sign out everywhere".

Checks after deploy: `GET /api/health/detail` as an Admin shows `mail.configured: true` and the host; use **Forgot password?** with your own address and read the email; click the link twice and see "already used".
The send happens after the database commit, so a provider outage never undoes a created client; the portal says when an email could not be sent. To try the whole stack on one machine without a provider:
`docker compose -f docker-compose.yml -f docker-compose.local-mail.yml up -d --build` and read the emails at <http://localhost:8025> (never on a real server).

## 7. Malware scanning (Done in code, needs infrastructure)

Every upload (documents and message attachments) goes through `VirusScanner`. Set `VIRUS_SCANNER=clamav` to scan each file with a ClamAV daemon over TCP (`INSTREAM`):

```
# add to docker-compose.yml
  clamav:
    image: clamav/clamav:stable
    restart: unless-stopped
    volumes: [clamdb:/var/lib/clamav]
# and in .env:  VIRUS_SCANNER=clamav   CLAMAV_HOST=clamav   CLAMAV_PORT=3310
```

If the scanner is down, slow (`CLAMAV_TIMEOUT_MS`) or answers unclearly, the upload is **refused** and nothing is stored. An infected file is refused with the signature name.
ClamAV needs about 1 to 2 GB of memory and keeps its signatures current with `freshclam` (the image does it). With `VIRUS_SCANNER=none` in production the API logs a warning at start-up.

## 8. Encryption at rest and backups (Scripts done; schedule, encryption and off-site copy need infrastructure)

- **Disks:** put the database volume and the `uploads` volume on encrypted storage (cloud disk encryption with a managed key, or LUKS on your own host).
- **Backups, as a pair:** `bash scripts/backup.sh` (Linux/macOS) or `powershell -ExecutionPolicy Bypass -File scripts\backup.ps1` (Windows) writes `innovexify-db-<UTC stamp>.dump` (`pg_dump --format=custom`) and
  `innovexify-uploads-<same stamp>.tar.gz` (the uploads volume) into `BACKUP_DIR` (default `./backups`, git-ignored), checks that both can be read back, and keeps the newest `BACKUP_KEEP` (default 14) of each.
  A document row without its file is a broken document, so a pair with one stamp is restored together. Run it from cron / Task Scheduler at least nightly, and **immediately before every release that has a migration**.
- **Off the machine, encrypted:** the backup holds password hashes and client documents. Copy `BACKUP_DIR` off the host after every run (object storage with versioning, another site) and encrypt it first
  (for example `age`, or the provider's KMS). Keep at least 14 daily and 12 monthly copies. A managed Postgres with point-in-time recovery is better still.
- **Restore, and prove it:** `scripts/RESTORE.md` has the exact steps, including restoring into a scratch database and comparing **row counts** with the live one. Do that every quarter and after changing the backup process.
  The first run of these scripts on this repository's stack is recorded in the Phase 6 verification below.

## 9. Retention (Needs a decision)

The audit log and uploads are kept until someone removes them; nothing deletes them automatically.
Decide: how long must audit entries be kept (often 6 to 7 years for compliance work), and when may a removed client's documents be destroyed. Then schedule it: for example
export audit entries older than 24 months with **Audit & Security → Export CSV** (filter by date) to cold storage, then delete them in SQL after a second person approves.
The portal never deletes an audit entry. Removed users and their records are soft-deleted and kept.

## 10. Redis for the analytics cache and rate limits (Needs infrastructure)

One API instance needs nothing. With **two or more**, the in-memory pieces are per instance: the analytics cache (a figure can be up to a minute old on any one), and the
message, search and sign-in rate limits (each instance counts separately, so the effective limit is multiplied). To share them, run Redis and:
1. Analytics: implement `AnalyticsCache` (`get` and `set` with `EX ttl`, JSON values) and provide it under `ANALYTICS_CACHE` in `AnalyticsModule` (see `backend/src/modules/analytics/SPECS.md`).
2. Rate limits: swap the `Map` in `RateLimitGuard` for a Redis counter with a one-minute expiry, and use `@nest-lab/throttler-storage-redis` for the global and sign-in throttler.
3. Set `MIGRATE_ON_START=false` (item 13).

## 11. Log shipping (Needs infrastructure)

The API logs JSON to standard output (pino) with a request id on every line; secrets and tokens are redacted. Ship container output to your log service (Loki/Promtail, CloudWatch,
Datadog, ELK) with the platform's log driver. Alert on `"level":50` (errors) and on sustained 5xx. The `requestId` in an error toast is the key to find the line.

## 12. Uptime monitoring (Endpoint done; the monitor needs infrastructure)

Two probes, both public and both answering **pass or fail only** (no host names, paths or error text; the reason goes to the log):

- `GET /api/health`: liveness, `200 {database: "up"}` or `503`. This is what the container healthcheck uses.
- `GET /api/health/ready`: readiness, for the uptime monitor. `200` with `{"status":"ok","checks":{"database":{"ok":true},"storage":{"ok":true},"mail":{"ok":true,"configured":true},"scanner":{"ok":true,"enabled":false}}}`,
  or `503` with `"status":"unavailable"` and the failing check marked `"ok":false`. It checks that the database answers, that storage is writable (a probe file is written and removed), that mail is configured, and,
  with `VIRUS_SCANNER=clamav`, that ClamAV answers a PING. It is throttled like any public route, so poll it once a minute, not once a second.
- `GET /api/health/detail` (Admin only): the same plus the settings behind it (mail transport and host, scanner, proxy hops, CORS origins) and the address the server sees for your request (item 2). Never shows a password.

Monitor `https://crm.example.com/api/health/ready` every minute from outside your network (UptimeRobot, Better Stack, a cloud check) and page on two failures in a row; alert on the **keyword** `"status":"ok"` missing,
not just the HTTP code. Also monitor the certificate expiry date and the free space on the database and uploads disks.

## 13. Migrations as a release step (Done in code, needs a pipeline)

The API image applies pending migrations when it starts unless `MIGRATE_ON_START=false`. For anything beyond a single small instance, run them as their own step **before** the new version takes traffic:

```
docker compose run --rm -e MIGRATE_ON_START=false api node node_modules/prisma/build/index.js migrate deploy
docker compose up -d --build        # with MIGRATE_ON_START=false in .env
```

Rules: migrations are forward-only and written to be compatible with the previous release (add columns before using them, remove them a release later), so the old version keeps working while the new one rolls out.
Never `db push` or `migrate dev` against production. Take a database backup (item 8) immediately before every release that has a migration.

## 14. Rollback plan (Needs a decision)

1. **Code only** (no migration in the release): redeploy the previous image tag: `docker compose up -d` with the previous tags. Nothing else changes.
2. **With a migration**: because migrations are backward compatible, redeploy the previous image; the new columns stay unused. Do not run a down migration in production.
3. **Bad data change** (a faulty migration or script): stop the API, restore the pre-release backup into a new database, restore the matching uploads snapshot, point `DATABASE_URL` at it, start the previous image.
   You lose changes made since the backup, so announce a maintenance window for releases with data migrations.
4. Tag every release image (`api:2026-10-23`, `web:2026-10-23`) and keep the last three.
Decide who may trigger a rollback and how long you accept being down (this sets how often backups must run).

## 15. Password reset (done) and two-factor sign-in (Needs a decision)

Password reset by email is built (item 6). **Two-factor sign-in is still not built.** It is small to add (TOTP with recovery codes) but needs a decision on whether Admins must use it, what happens when someone
loses their device (an Admin resets it, which is itself a takeover path to protect), and whether clients get it too.

## 16. Seed data and demo tooling off (Done in code)

- There are no demo buttons in the web app any more (the "Access & scenarios" panel and its `NEXT_PUBLIC_ENABLE_DEMO_TOOLS` flag were removed); the Admin's **Audit & Security → Security overview** still shows the access policy table from `GET /api/v1/access/matrix`.
- The seed refuses to run in production (item 5); do not copy a development database either.
- `/api/docs`, `/api/docs-json` and `/api/docs-yaml` (Swagger) are not mounted when `NODE_ENV=production`.
- Set `LOG_LEVEL=info`.

## 17. Security headers, CORS, API docs, dependencies and secrets (Done in code and CI; read the open points)

Checked on the running production stack (`docker compose up`, port 3000) and by tests that run in CI:

| What | Result | Where it is tested |
| --- | --- | --- |
| Web headers | `Content-Security-Policy` per request with a nonce: scripts only from this origin and inline scripts carrying that nonce (Next's bootstrap and the theme-init script), no `unsafe-inline` or `unsafe-eval` for scripts, `frame-ancestors 'none'`, `base-uri` and `form-action` `'self'`; `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb off), `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=63072000; includeSubDomains` in production, `Cache-Control: no-store` on reset and invitation links | `frontend/e2e/security.spec.ts`, `frontend/tests/unit/csp.test.ts` |
| The app under that policy | Every role signs in and opens every screen in its navigation, and the public pages load, with **zero** policy violations; an injected script without the nonce does not run | `frontend/e2e/security.spec.ts`, `uploads.spec.ts`, `password-reset.spec.ts` |
| API headers | Helmet on every `/api` response (`nosniff`, CSP, HSTS, no `X-Powered-By`), also through the web app's proxy | `backend/test/hardening.e2e-spec.ts`, `security.spec.ts` |
| Refresh cookie in production | `Set-Cookie: refresh_token=<token>; Max-Age=604800; Path=/api/v1/auth; Expires=...; HttpOnly; Secure; SameSite=Strict`, token absent from the JSON body, cleared with the same attributes on sign-out | `hardening.e2e-spec.ts`, stack test |
| A 500 never explains itself | A thrown error and a database error whose message contains SQL both answer `500 INTERNAL_ERROR` with a fixed message, the request id and nothing else: no stack, SQL, table name, path or connection string | `hardening.e2e-spec.ts` |
| Uploads need a session | `/api/v1/documents/:id/download` without a token is 401; no static route serves the storage folder (`/uploads`, `/storage`, `/api/uploads`, ... never return file bytes) | `hardening.e2e-spec.ts`, `documents.e2e-spec.ts`, stack test |
| CORS is closed | In production `CORS_ORIGINS` is empty by default and the API then sends **no** CORS headers, preflight included: the browser only talks to the web app's own origin | `backend/src/config/env.spec.ts`, `hardening.e2e-spec.ts`, stack test |
| API docs | `/api/docs`, `/api/docs-json` and `/api/docs-yaml` are 404 in production and served in development | `hardening.e2e-spec.ts`, stack test |
| Logs | No password, token, cookie, bearer token, `JWT_ACCESS_SECRET` or database password in the container logs after a full invitation, sign-in and password-reset run; invitation and reset links appear as `/auth/invitations/[REDACTED]` and `/auth/reset-password/[REDACTED]` (a logged link would still work, so the path is redacted) | `hardening.e2e-spec.ts`, stack test |
| Dependencies (`npm audit --omit=dev`) | **Backend: 0 high or critical** (CI fails on high). **Frontend: 0** after moving Next.js 14.2.35 (many advisories, three of them critical remote-code-execution ones, none fixed in 14.x) to **15.5.28** with React 19, and overriding Next's bundled PostCSS | CI, both jobs |
| Secrets | gitleaks over every commit and over the working tree: no findings. Its config allows only two documentation placeholder passphrases and the fake values the tests invent | CI job `secrets` |

**Open points and what could not be fixed**

- **Backend, 6 moderate advisories remain, no high:** `@nestjs/core` (injection, GHSA-36xv-jgw5-4q75) and its dependants `@nestjs/platform-express`, `@nestjs/swagger`, `@nestjs/throttler`, and `file-type`
  (via `@nestjs/common`). They are fixed only in NestJS 11/12, a major upgrade (Express 5, new throttler) that needs its own change and test cycle. `file-type` is only reached by Nest's optional `FileTypeValidator`,
  which this API does not use. The high ones (`multer`, `body-parser`, `qs`, `lodash`, `js-yaml`, `deepmerge-ts`) are fixed with `overrides` in `backend/package.json`; **remove an override once the package that needed it ships the fix**.
- **The multer update changed an error message** that Nest 10 matched by text, which turned a missing or wrongly named upload field into a 500; the upload error handling now matches multer's error `code`
  (`backend/src/common/storage/upload-errors.interceptor.ts`, with tests).
- **Frontend: React 19 and Next 15.** `next lint` is deprecated (removed in Next 16); migrate to the ESLint CLI when you move to 16. Zod's compiled parser is switched off (`frontend/src/lib/z.ts`) because it needs `unsafe-eval`.
- **Styles allow inline** (`style-src 'unsafe-inline'`): React writes `style=""` attributes into the HTML. Scripts do not.
- **Document previews:** a PDF preview is a `blob:` frame, which inherits the page policy, so `object-src` allows `blob:`. The tests check that the frame loads under the policy with no violation; they do not check that a given browser's PDF viewer draws it.
- **Sign-in guessing across many emails from one address** is limited only by the global 100 a minute (item 2). Add a proxy rate limit on `/api/v1/auth/login` if that matters.
- **A password reset leaves an already-issued access token alive for up to 15 minutes** (`JWT_ACCESS_TTL_SECONDS`), as "sign out everywhere" does. Lower the TTL if that is too long.
- **Mail is handed to the SMTP server after the answer** to "Forgot password", so a provider outage shows up in the log (and `/api/health/ready` only checks that mail is *configured*, not that the provider is up), not to the person.

**Stack test, 2026-10-24** (`docker compose -f docker-compose.yml -f docker-compose.local-mail.yml up -d --build`, then the real browser and HTTP through port 3000): `db`, `api` and `web` healthy (plus the trial mail
server); first Admin created with `npm run admin:create` and a second run refused; CSR and client invited and accepted through real SMTP; a client uploaded a PDF and downloaded the identical bytes; the same bytes came back after
`docker compose restart api` and after `docker compose down` then `up` (volumes kept); sign-in, reload and forgot-password in headless Chromium at `http://localhost:3000`; backups taken with both scripts and restored into a scratch database
with identical row counts (33 tables, 107 rows) and an identical uploads checksum. Without SMTP settings the API container exits at start-up listing the missing ones (fail fast). Two defects were found and fixed by this run:
the backup scripts (Git Bash path rewriting; PowerShell quoting) and `TRUST_PROXY` (item 2: the web app's proxy does not add the client address).

---

## Before the first real client

- [ ] Items 1, 4, 5, 6, 7, 8 are in place and tested (send yourself an invitation and a password reset; upload a file with the EICAR test string and see it refused; take a backup and restore it into a scratch database).
- [ ] `TRUST_PROXY` matches your layout (item 2) and the forged-header check passes.
- [ ] The service catalog exists (item 5), a second Admin exists, and the owner has changed the one-off password.
- [ ] Items 9 and 14 are decided and written down; item 15 (two-factor) is decided.
- [ ] `docker compose ps` shows `db`, `api` and `web` healthy; `/api/health/ready` is monitored and the backup job and its off-site copy are scheduled.
- [ ] `npm audit --omit=dev --audit-level=high` is clean in both apps on the day you release (CI enforces it).
