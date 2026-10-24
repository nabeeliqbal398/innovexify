# Innovexify CRM: backend

NestJS + Prisma + PostgreSQL. PostgreSQL runs **only in Docker**; you do not need a local Postgres install.

The full schema is in place. Modules are added one at a time: auth, users, clients, cases, tasks, follow-ups, documents (with file storage), filings and reports so far (each has a
`SPECS.md` with its endpoints, rules and error codes; shared pieces are in `src/common/SPECS.md`).

## Run with Docker (Windows PowerShell)

```powershell
Copy-Item .env.example .env      # then edit .env and set a real POSTGRES_PASSWORD
npm install --legacy-peer-deps
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run start:dev
```

Check it: `Invoke-RestMethod http://localhost:4000/api/health` returns `status: ok, database: up`.
When the database is down it returns **503** with a clear message.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run db:up` / `db:down` | Start / stop the database container |
| `npm run db:reset` | Delete the data volume, start fresh, migrate and seed |
| `npm run db:logs` | Follow the database logs |
| `npm run db:migrate` | `prisma migrate dev` (development; needs permission to create the shadow database, which the default Postgres superuser has) |
| `npm run db:deploy` | `prisma migrate deploy` (production and CI; never `db push`) |
| `npm run db:seed` | `prisma db seed` (idempotent) |
| `npm run db:studio` | Prisma Studio |
| `npm run test:e2e` | Creates (if needed) and migrates `innovexify_test`, then runs the e2e tests against it. **Refuses any database whose name does not end in `_test` or `_e2e`.** |
| `npm run test:db:e2e` | Drops and recreates `innovexify_e2e`, the browser tests' database (the frontend's Playwright global setup does this itself) |

pgAdmin is optional: `docker compose --profile tools up -d pgadmin` (http://127.0.0.1:5050).

### Other scripts

| Script | What it does |
| --- | --- |
| `npm run admin:create` | Creates the first Admin of a new installation from `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` (refuses when an Admin exists). Use it in production, where there is no seed data. Runs from the build: `node dist/cli/create-admin.js` |
| `bash scripts/with-test-lock.sh <command>` | Runs a command while holding a lock on the shared test database, so two people never run e2e tests at once |
| `bash scripts/restart-api.sh` | Rebuilds and restarts the development API (used before `npm run api:types` in the frontend) |

### Production-style run

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

The `api` image is multi-stage and runs as the non-root `node` user. Inside compose `DATABASE_URL` uses host `db`,
and the database port is not published.

## API

- Base path `/api/v1` (health is version-neutral at `/api/health`). Interactive docs at `/api/docs` (off in production).
- Every success is `{ success, statusCode, message, data, meta?, timestamp, path }`; every error is
  `{ success: false, statusCode, errorCode, message, errors?, requestId, timestamp, path }`. Validation errors list one
  entry per field in `errors`. Stack traces never leave the server; the full detail is logged with the request id.
- Auth: bearer access token plus single-use refresh tokens with reuse detection. See `src/modules/auth/SPECS.md`.
- Lists take `?page` (>= 1), `?limit` (1 to 100), `?sort` and `?order`. Values outside the range are rejected with a message on
  the field, never clamped. A record outside your role's scope returns 404, not 403.
- Phase 4 modules (each has a `SPECS.md`): messages, announcements, tickets, notifications, audit (Admin only, CSV export), company, services,
  automation (notification triggers), access matrix, dashboard (`GET /dashboard/overview`), analytics (`GET /analytics`, at most 24 months, cached
  `ANALYTICS_CACHE_SECONDS`) and global search (`GET /search?q=`). Conversations and notifications page by cursor (`before`, `since`);
  sending messages and searching are rate-limited per person (`MESSAGE_RATE_LIMIT_PER_MIN`, `SEARCH_RATE_LIMIT_PER_MIN`). A reopened ticket window
  is `TICKET_REOPEN_DAYS`. In-memory caches and limits are per instance; see `src/common/SPECS.md` for the Redis swap.
- Also for the web app: `GET /users/directory` (staff pickers), `GET /dashboard/nav-counts`, client-list extras (`lastContactAt`, `nextFollowUp`, `onboarding`, `?filter=`), staff `workload`, and `GET /services` with `activeCases`. `MAIL_OUTBOX_FILE` (development only) appends every email to a file, and `AUTH_THROTTLE_LIMIT` raises the sign-in limit for browser tests. `VIRUS_SCANNER=clamav` scans uploads with ClamAV (`GO-LIVE.md`).
- Uploaded documents are stored by `StorageService` (local disk in `STORAGE_DIR`). See "File storage" below.
- Email goes through `MailService`, chosen by `MAIL_TRANSPORT`: `smtp` sends through your server (nodemailer; `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASSWORD` and `MAIL_FROM`, all required: the API will not start without them), `log` writes the email (links included) to the API log and sends nothing.
  `log` is for development and tests only: **the API refuses to start with it when `NODE_ENV=production`**. Invitations, password-reset links and the
  "your password was changed" notice use it. `GET /api/health/detail` (Admin) reports whether mail is configured; `GET /api/health/ready` is the public readiness probe for uptime monitoring.
- Seeded accounts (for example `sarah.bennett@example.com`, Admin) all use the `SEED_PASSWORD` from your `.env`.

## Configuration

`.env` holds everything; `DATABASE_URL` is built from the `POSTGRES_*` values. The host is `localhost` when the API
runs on your machine and `db` when it runs inside compose. The API validates its environment at startup and exits
with a readable list of problems if something is missing or malformed.

**Connection pool:** `connection_limit` in `DATABASE_URL` (from `DB_CONNECTION_LIMIT`, default `10`) sets how many
connections each API process keeps open. Postgres allows 100 by default, so keep
`connection_limit x number of API instances` comfortably below that.

The Prisma client retries its first connection about 5 times with backoff (1s, 2s, 4s, 8s) because the container
may still be starting. The API closes the pool cleanly on shutdown.

### Refresh cookie: `REFRESH_COOKIE_SAMESITE`

The refresh token lives in an `httpOnly` cookie. `REFRESH_COOKIE_SAMESITE` sets its `SameSite` attribute:

| Value | Use it when |
| --- | --- |
| `strict` (default) | the frontend and the API are on the same site |
| `lax` | the frontend links into the app from other sites and you still want the cookie on the first request |
| `none` | the frontend is on a different site from the API. Needs HTTPS: the cookie must be `Secure` |

The cookie is always `Secure` when `NODE_ENV=production`; elsewhere set `REFRESH_COOKIE_SECURE=true` to force it. The API
**refuses to start** with `REFRESH_COOKIE_SAMESITE=none` unless the cookie is Secure, and says why, rather than letting
browsers silently discard every refresh token. (This replaces the earlier `COOKIE_SAMESITE` name.)

### File storage

Client documents are uploaded to the API (`POST /api/v1/documents/:id/upload`, multipart, field `file`) and stored on disk, not in the database.

| Setting | Default | Meaning |
| --- | --- | --- |
| `STORAGE_DIR` | `./storage` | Where files are kept. Created at startup. Keep it outside any web-served folder; nothing in the API serves it. |
| `MAX_UPLOAD_MB` | `25` | Largest accepted file, 1 to 100. A larger file is refused with a message that names the limit. |

- Accepted: PDF, PNG, JPG and DOCX, decided by the file's **contents** (not its name or the type the browser claims). A program
  renamed `.pdf`, a double extension such as `invoice.pdf.exe`, an empty file and a file whose type doesn't match its extension
  are each refused with their own message.
- Files are saved under a random key, never their own name. The original name is kept, cleaned, in the database only.
- Downloads go through the API (`GET /api/v1/documents/:id/download`), which checks who is asking and audits the download.
- **Back up `STORAGE_DIR` together with the database.** A document row without its file is a broken document. With Docker,
  `docker-compose.prod.yml` mounts a named volume (`uploads`) on `/app/storage`.
- The virus-scan step is a placeholder (`NoopScanner`); it marks where a real scanner plugs in. `LocalDiskStorage` can be replaced by an
  S3 implementation without touching the rest of the code (see `src/common/SPECS.md`).

## Troubleshooting

- **Port 5432 already in use**: set `POSTGRES_PORT=5433` (or any free port) in `.env`. `DATABASE_URL` follows
  automatically; if you wrote it by hand, update the port there too. Then `docker compose up -d db` again.
- **Docker Desktop not running**: `docker compose` fails with "cannot connect to the Docker daemon" or
  "pipe/dockerDesktopLinuxEngine not found". Start Docker Desktop, wait until it says it is running, retry.
- **Authentication failed after changing the password**: Postgres only reads the password the first time the volume is
  created. Run `docker compose down -v` (this deletes the data), then `docker compose up -d db` and migrate/seed again.
- **P1001 "Can't reach database server"**: the container is not up yet or the URL is wrong. Check
  `docker compose ps` (the `db` service should say `healthy`), `npm run db:logs`, and that `DATABASE_URL` uses the
  host `localhost` and the same port as `POSTGRES_PORT` when the API runs on your machine.
