# Access matrix module

## Purpose
The "who can do what" table shown to staff, generated from the same permission table the server enforces (`common/permissions/permissions.ts`),
so the table on screen cannot disagree with what the API allows.

## Endpoint
`GET /api/v1/access/matrix` (any signed-in user) returns `{ roles, rows }`: `roles` is `["ADMIN","MANAGER","CSR","COMPLIANCE","CLIENT"]` and
`rows` has the 18 capabilities in display order, each `{ label, permission, roles: [...] }`. It is read-only; there is no way to edit permissions
through the API (they are code, reviewed and tested).

## Tests
`test/settings.e2e-spec.ts` (access section) and `common/permissions/permissions.spec.ts`.
