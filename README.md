# Innovexify CRM

A client, case and compliance portal for business-formation services. One git repository.

| Folder | What |
| --- | --- |
| `backend/` | NestJS + Prisma + PostgreSQL API (`backend/README.md`, and a `SPECS.md` in every module) |
| `frontend/` | Next.js web app that uses the API (`frontend/README.md`) |
| `docker-compose.yml` | Database, API and web app together (production-style) |
| `docker-compose.local-mail.yml` | Optional: a catch-all mail server for trying that stack on one machine |
| `scripts/` | `backup.sh` / `backup.ps1` and `RESTORE.md` |
| `.github/workflows/ci.yml` | CI: type check, lint, unit, e2e and browser tests, build and dependency audit for both apps |
| `GO-LIVE.md` | What is still needed before real clients use it |

The repository was put together from three earlier ones (root, backend, frontend) with their histories kept: the first-parent line is this repository's own
history, and the tags `pre-merge/backend` and `pre-merge/frontend` point at the last commit of each earlier history (`git log pre-merge/backend`).

## Run everything in Docker

```powershell
Copy-Item .env.example .env        # set POSTGRES_PASSWORD, JWT_ACCESS_SECRET and the SMTP_* settings
docker compose up -d --build
docker compose exec -e ADMIN_EMAIL=you@example.com -e ADMIN_NAME="Your Name" -e ADMIN_PASSWORD='<a long, unique passphrase>' api npm run admin:create
```

Open <http://localhost:3000> and sign in. The API sends real email (production mode refuses to start without SMTP settings). To try the stack on one machine without a mail
provider, add the trial mail server and read the emails at <http://localhost:8025>:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local-mail.yml up -d --build
```

## Run for development

```powershell
cd backend
Copy-Item .env.example .env
npm install --legacy-peer-deps
docker compose up -d db --wait
npm run db:migrate; npm run db:seed
npm run start:dev                  # API on http://localhost:4000 (docs at /api/docs); emails are written to its log

cd ..rontend
npm install --legacy-peer-deps
Copy-Item .env.example .env.local
npm run dev                        # http://localhost:3000
```

## Test and build everything

```powershell
cd backend;  npm run db:reset; npx tsc --noEmit; npm run lint; npm test; npm run test:e2e; npm run build
cd ..rontend; npx tsc --noEmit; npm run lint; npm test; npm run build; npm run test:e2e
```

Tests never touch the development database: the backend e2e tests use `innovexify_test` and the browser tests use `innovexify_e2e`, and both refuse to run against any database
whose name does not end in `_test` or `_e2e`. (`npm run db:reset` in `backend` is for you: it wipes the **development** database and reseeds it.)

## Backups

`bash scripts/backup.sh` (or `powershell -File scriptsackup.ps1`) writes a timestamped `pg_dump` and a tar of the uploads volume into `BACKUP_DIR`, keeping the newest `BACKUP_KEEP`.
Restore steps, with the row-count check, are in `scripts/RESTORE.md`; the schedule and off-site copy belong in `GO-LIVE.md`, item 8.
