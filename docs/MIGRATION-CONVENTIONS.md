# Moving a screen from the in-memory prototype to the API: conventions

Read this before touching a screen. The reference implementation is the staff area (`components/features/staff/*`,
`components/features/people/person-dialogs.tsx`) with `store/api/people.ts` and `lib/mappers/people.ts`.

## Pieces that already exist
- `store/api/base.ts`: `baseApi` (RTK Query), re-auth with a single-flight refresh, `TAGS`. Add endpoints with
  `baseApi.injectEndpoints` in **your own file** `store/api/<area>.ts`. Use the existing tag names; invalidate broadly rather than miss one.
- `store/api/envelope.ts`: `Env<T, Meta>`, `unwrap`, `toPage`, `toCursor`, `params` (drops empty values).
- `lib/api-mappers.ts` is only a barrel. Put your mappers in **your own file** `lib/mappers/<area>.ts` (the stub already exists and is
  already re-exported). Use `enums.ts` (`CASE_STAGE.toLabel(key)`, `.index(key)`, `.toKey(label)`), `toMs` for timestamps and `toDay`
  for `YYYY-MM-DD` dates (never `new Date()` a date-only value).
- Screens keep using the prototype's view types from `types/domain.ts` (labels, ms timestamps). Change a type only where the API
  forces it (numeric ids become the API's string ids; add `apiId`/name fields when the screen needs a display id *and* the API id).
  Edit only the interfaces of your own area, with small targeted edits (other people edit the same file).
- `hooks/useAction.ts`: `const run = useAction(); await run(trigger(args), { success, setError, fields, quiet })`. It opens the
  "not available" dialog on 403, the "changed while you were editing" prompt on 409 CONCURRENT_MODIFICATION, puts field errors on the form,
  and toasts everything else. Disable the submit button while the mutation's `isLoading`.
- `components/common/query-state.tsx`: `QueryState` (skeleton / error with retry / empty), `Skeleton`, `ErrorState`. `components/common/pager.tsx`
  (zero-based `page`). `hooks/useDebounced.ts` for search boxes (300 ms; 250 ms for global search).
- `useDirectoryQuery({ role })` (people.ts): active staff `{id,name,role}` for pickers; the only way a CSR or Compliance user can list staff.
- `useMe()` is the signed-in `User`. `can()` in `lib/permissions.ts` only shows or hides controls; the server is the authority.
- Versions: send `version` on every edit of cases and tickets, taken from the freshest query data at submit time (not a stale closure).

## Rules
1. Do not fake data on the client. If a screen needs something the API does not give, add the smallest backend field or endpoint **with tests and a
   SPECS.md update**, regenerate types (`npm run api:types` in `frontend`, needs the API running), and append a row to `docs/PHASE5-GAPS.md`.
2. Server pagination and filters for any list that can grow. Reset to page 1 when a filter changes.
3. Every list/detail has loading (skeleton), empty and error-with-retry states. Never show raw server text or HTML: only `ApiError.message`.
4. Mutations: disable the button while running; on success invalidate tags (the lists refetch); toast the success message.
5. Delete the old thunk(s) you replace from `store/actions/*` and the `workspaceSlice` use in your screens. Those legacy files are `@ts-nocheck`
   on purpose and are removed at the end; do not edit them except to delete what you replaced. Delete helpers your screens no longer use.
6. Keep every user-visible wording, layout and class name as it is unless the API forces a change (for example, "simulated" copy goes).
7. No `console.log`, no `any`, no localStorage.
8. Lint and types: `npx tsc --noEmit` shows errors from other people's screens while the migration is in progress; look only at your own files.
   `npm run lint` must pass for your files.

## Shared environment (several people work at once)
- The dev API (port 4000) and Next dev server (port 3000) are shared. **Never reset or reseed the dev database.** Seeded accounts all use `SEED_PASSWORD`
  from `backend/.env`: `sarah.bennett@example.com` (Admin), `daniel.reyes@example.com` (Manager), `john.smith@example.com` and `ayesha.khan@example.com`
  (CSRs), `maya.chen@example.com` and `omar.haddad@example.com` (Compliance), `alex.morgan@northfield.co` (client c42, CSR John).
- Backend tests share one test database: always run them through `backend/scripts/with-test-lock.sh <command>` (it queues behind other runs), e.g.
  `bash scripts/with-test-lock.sh npx jest --config test/jest-e2e.config.js test/clients`.
- After a backend change: `bash backend/scripts/restart-api.sh` (build + restart the dev API), then `npm run api:types` in `frontend`.
- Files are created with the Write tool (not shell heredocs: apostrophes break them in this shell).
- Verify a screen in a browser with a short Playwright script (chromium is installed; run it from `frontend/` so `@playwright/test` resolves) once your
  files compile; if the page fails because of someone else's half-done file, wait and retry. Login rate limit: 5 sign-ins per minute per address on the dev API,
  so reuse a session (`storageState` is not needed: the refresh cookie lives in the browser context).
