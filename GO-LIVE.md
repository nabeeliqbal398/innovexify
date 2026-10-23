# Go-live checklist

What stands between "it works on a laptop" and "real clients use it". Each item says whether it is **Done in code**, **Needs infrastructure**
(someone must set something up outside the code) or **Needs a decision** (the business must choose), then the exact steps.

| # | Item | Status |
| --- | --- | --- |
| 1 | HTTPS and the reverse proxy rule | Needs infrastructure |
| 2 | Real client address behind the proxy (`TRUST_PROXY`) | Done in code, needs configuration |
| 3 | Refresh cookie: `SameSite` and `Secure` | Done in code |
| 4 | Secrets and their rotation | Needs infrastructure |
| 5 | The first Admin account (no seed data in production) | Done in code |
| 6 | Email delivery | Needs infrastructure |
| 7 | Malware scanning of uploads (ClamAV) | Done in code, needs infrastructure |
| 8 | Encryption at rest and backups | Needs infrastructure |
| 9 | Retention of audit logs and uploads | Needs a decision |
| 10 | Redis for the analytics cache and rate limits (more than one instance) | Needs infrastructure |
| 11 | Log shipping | Needs infrastructure |
| 12 | Uptime monitoring of `/api/health` | Needs infrastructure |
| 13 | Migrations as a separate release step | Done in code, needs a pipeline |
| 14 | Rollback plan | Needs a decision |
| 15 | Password reset by email and two-factor sign-in | Needs a decision (not built) |
| 16 | Demo tools and seed data off | Done in code |

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
3. Add the HSTS header at the proxy once HTTPS works: `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
4. If you build the web image by hand, remember the `/api` rewrite is read **when Next builds**: pass `--build-arg API_ORIGIN=http://api:4000`.

## 2. Real client address (`TRUST_PROXY`) (Done in code, needs configuration)

The sign-in limit (5 a minute, `AUTH_THROTTLE_LIMIT`) and the global limit are per client address. Behind a proxy every request seems to come from the proxy,
so everybody would share one limit. Set `TRUST_PROXY=true` **only** when the API is reachable solely through proxies you control (the compose file sets it), and make sure the
proxy sets `X-Forwarded-For`. If the API were reachable directly with `TRUST_PROXY=true`, a caller could forge their address and dodge the limit.
Check after deploy: sign in wrongly 6 times from your own machine, then from a phone on another network: only the first should be blocked.

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
| `SEED_PASSWORD` | development `.env` only | **Never set in production.** Seeding is refused when `NODE_ENV=production` unless `ALLOW_PROD_SEED=true`: do not set that either. |
| Mail provider key | secret store | Per provider. |

Keep `.env` out of git (it is ignored), out of images (`.dockerignore`), and in a secret manager (Docker/Kubernetes secrets, a cloud vault) rather than on disk when you can.

## 5. The first Admin account (Done in code)

Production has no seed data, so create the owner once, from the API container:

```
docker compose exec -e ADMIN_EMAIL=owner@yourcompany.com -e ADMIN_NAME="Olive Owner" -e ADMIN_PASSWORD='a-long-unique-passphrase-1A' api npm run admin:create
```

It refuses if an Admin already exists, if the password breaks the policy (12 to 128 characters, upper and lower case, a number) or if the email is taken. Sign in, then
invite everyone else from **Staff & Invitations**. Use a real password manager; the command line is kept in your shell history.

## 6. Email delivery (Needs infrastructure)

`LogMailService` only writes emails to the log. Implement `MailService` for your provider (SMTP or an API such as SES, Postmark, SendGrid) in
`backend/src/common/mail/mail.service.ts`, bind it in `MailModule`, and set up SPF, DKIM and DMARC for your sending domain. Until then invitation emails are **not
delivered**: use the invitation link printed in the API log, or "Resend invitation", and tell people. The send happens after the database commit, so a provider outage never undoes a
created client; the portal says when an email could not be sent.

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

## 8. Encryption at rest and backups (Needs infrastructure)

- **Disks:** put the database volume and the `uploads` volume on encrypted storage (cloud disk encryption with a managed key, or LUKS on your own host).
- **Database backups:** `docker compose exec -T db pg_dump -U $POSTGRES_USER -Fc $POSTGRES_DB > backup-$(date +%F).dump` nightly, copied off the host and encrypted
  (for example `age` or your cloud's KMS). Keep at least 14 daily and 12 monthly copies. A managed Postgres with point-in-time recovery is better still.
- **Uploads:** snapshot or `rsync` the `uploads` volume **at the same time** as the database: a document row without its file is a broken document, and a file without its row is invisible.
- **Test the restore** into a scratch environment every quarter: `pg_restore -d innovexify_restore backup.dump`, restore the uploads volume, start the API against it, open a document.

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

## 12. Uptime monitoring (Needs infrastructure)

`GET /api/health` returns 200 with `{ database: "up" }`, or 503 when the database is down. Monitor `https://crm.example.com/api/health` every minute from outside your network
(UptimeRobot, Better Stack, a cloud check) and page on two failures in a row. Also monitor the certificate expiry date and the free space on the database and uploads disks.

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

## 15. Not built: password reset by email and two-factor sign-in (Needs a decision)

There is no "forgot password" or two-factor flow in the API, so the sign-in page says to ask an administrator for a new invitation. If you want them, they are small to add (a reset token table, an email
template and two endpoints; TOTP with recovery codes) but need your email provider first (item 6) and a decision on whether Admins must use two-factor.

## 16. Demo tools and seed data off (Done in code)

- `NEXT_PUBLIC_ENABLE_DEMO_TOOLS` must be `false` (the default) in production: it only shows buttons that fire test requests at the seeded demo records.
- Do not run the seed in production, and do not copy a development database.
- `/api/docs` (Swagger) is off when `NODE_ENV=production`.
- Set `LOG_LEVEL=info`.

---

## Before the first real client

- [ ] Items 1, 4, 5, 6, 7, 8 are in place and tested (send yourself an invitation; upload a file with the EICAR test string and see it refused; restore a backup).
- [ ] Items 9 and 14 are decided and written down.
- [ ] A second Admin exists (the last active Admin cannot be suspended or removed, so one account is a single point of failure for the owner).
- [ ] `docker compose ps` shows `db`, `api` and `web` healthy; `/api/health` is monitored.
