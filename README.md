# Innovexify CRM: frontend

Next.js 14 (App Router), TypeScript strict, Tailwind, Redux Toolkit, React Hook Form + Zod, React-Toastify.

## Run
```
npm install --legacy-peer-deps
npm run dev          # http://localhost:3000
npm run typecheck && npm run lint
npm run build && npm start
```
Copy `.env.example` to `.env.local` if you need to change the public values.

## Screens
`/` sign-in and invitation states. Role workspaces, each locked to one user:
`/admin`, `/manager`, `/csr`, `/compliance`, `/client`. Pages live at `/<role>/<view>[/<id>]`.

## Structure
- `src/lib/permissions.ts`: the single permission table; every action checks it.
- `src/store`: workspace slice (seeded demo data) and guarded action thunks.
- `src/components/ui`: UI kit. `src/components/features/<area>`: one folder per screen group.
- `src/styles/tokens.css`: design tokens (light and dark).

## Status
Data is simulated in memory and resets on reload; emails and file storage are simulated.
There is no backend yet.
