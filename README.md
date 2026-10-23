# Innovexify CRM

A client, case and compliance portal for business-formation services.

| Folder | What |
| --- | --- |
| `backend/` | NestJS + Prisma + PostgreSQL API (`backend/README.md`, and a `SPECS.md` in every module) |
| `frontend/` | Next.js web app that uses the API (`frontend/README.md`) |
| `docker-compose.yml` | Database, API and web app together |
| `GO-LIVE.md` | What is still needed before real clients use it |

The backend and frontend each have their own git history; this root repository tracks only the files above.

## Run everything in Docker

```powershell
Copy-Item .env.example .env        # set POSTGRES_PASSWORD and JWT_ACCESS_SECRET
docker compose up -d --build
docker compose exec -e ADMIN_EMAIL=you@example.com -e ADMIN_NAME="Your Name" -e ADMIN_PASSWORD='Choose-A-Long-Passphrase-1' api npm run admin:create
```

Open <http://localhost:3000> and sign in. Emails are written to the API log (`docker compose logs api`) until a mail provider is connected; the invitation link is in there.

## Run for development

```powershell
cd backend
Copy-Item .env.example .env
npm install --legacy-peer-deps
docker compose up -d db --wait
npm run db:migrate; npm run db:seed
npm run start:dev                  # API on http://localhost:4000 (docs at /api/docs)

cd ..\frontend
npm install --legacy-peer-deps
Copy-Item .env.example .env.local
npm run dev                        # http://localhost:3000
```

## Test and build everything

```powershell
cd backend;  npm run db:reset; npx tsc --noEmit; npm run lint; npm test; npm run test:e2e; npm run build
cd ..\frontend; npx tsc --noEmit; npm run lint; npm test; npm run build; npm run test:e2e
```

`npm run test:e2e` in `frontend` resets the development database and drives a real browser against the real API.
