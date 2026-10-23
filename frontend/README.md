# Innovexify CRM: frontend

Next.js 14 (App Router), TypeScript strict, Tailwind, Redux Toolkit with RTK Query, React Hook Form + Zod, React-Toastify.
It talks to the real API (`../backend`); nothing is simulated.

## Run (development)

```powershell
# 1. the API and its database (see ../backend/README.md)
cd ..\backend; docker compose up -d db --wait; npm run db:migrate; npm run db:seed; npm run start:dev
# 2. this app
cd ..\frontend
npm install --legacy-peer-deps
Copy-Item .env.example .env.local        # API_ORIGIN defaults to http://localhost:4000
npm run dev                               # http://localhost:3000
```

Seeded accounts all use the `SEED_PASSWORD` from `../backend/.env`: `sarah.bennett@example.com` (Admin), `daniel.reyes@example.com` (Manager),
`john.smith@example.com` (CSR), `maya.chen@example.com` (Compliance), `alex.morgan@northfield.co` (client).

## One origin

The browser only calls same-origin `/api/v1/...`. `next.config.mjs` rewrites `/api/:path*` to `API_ORIGIN` (server-side, default `http://localhost:4000`), so there is no
CORS and the API's `SameSite=Strict` refresh cookie is first-party. Next reads the rewrite **when it builds**, so build with the right `API_ORIGIN`
(compose does). In production a reverse proxy does the same job: see `../GO-LIVE.md`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | `tsc --noEmit` and `next lint` |
| `npm test` | Vitest: API client (single-flight refresh), error normalizing, mappers, forms, and the permission table matching the backend's |
| `npm run test:e2e` | Playwright against the real API and a freshly reset database (see below) |
| `npm run api:types` | Regenerates `src/types/api.generated.ts` from the running API's OpenAPI document (`/api/docs-json`, development only) |

### Browser tests

`npm run test:e2e` resets the **development database** (`npm run db:reset` in `../backend`), builds both apps, starts the API on port 4100 and the web app on port 3100
(so a dev server on 3000/4000 is left alone) and runs headless Chromium. Failures keep a screenshot and a trace in `test-results/`; the HTML report is in `playwright-report/`.
`E2E_SKIP_RESET=1` keeps the current data when you re-run one test. Docker must be running (the database).

## Structure
- `src/store/api/*`: RTK Query endpoints, one file per area, on top of `base.ts` (in-memory access token, one shared refresh on a 401, one retry, never a loop).
- `src/lib/mappers/*` (re-exported by `src/lib/api-mappers.ts`): API records to the types the screens use (labels from `constants/vocab.ts`; dates stay `YYYY-MM-DD` text).
- `src/lib/api-error.ts`: `normalizeApiError`; `src/hooks/useAction.ts`: runs a mutation and handles a refusal (403 dialog), a conflict (409 reload prompt), field errors and toasts in one place.
- `src/lib/permissions.ts`: the permission table, used only to show or hide controls. The server decides; `tests/unit/permissions-parity.test.ts` fails if it drifts from the backend's table.
- `src/components/ui`: UI kit. `src/components/features/<area>`: one folder per screen group. `src/components/common/query-state.tsx`: loading, empty and error-with-retry states.
- `src/types/api.generated.ts` (generated) and `src/types/api.ts` (response envelopes).
- `docs/PHASE5-GAPS.md`: what the API had to gain so screens did not have to fake data.

## Session

On page load the app trades the refresh cookie for an access token (kept in Redux state only, never in browser storage), then loads `/auth/me`. No cookie means the sign-in page. A request that fails
because the token expired triggers one refresh shared by every request that failed together; if the refresh is refused the person lands on the sign-in page with "Your session ended".
Role routes (`/admin`, `/manager`, `/csr`, `/compliance`, `/client`) are a convenience: someone whose role does not match gets the "not available" page, and the server enforces everything.
