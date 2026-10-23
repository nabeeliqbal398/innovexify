# Company module

## Purpose
The company profile shown in every screen's header: name, logo and the case prefix.

## Database models
`Company` (a single row, `id = 1`: `name`, `logo` as a data URL or `""`, `casePrefix`), `AuditLog` (category `settings`).

## Endpoints
Base `/api/v1`. Bearer token required.

| Method | Route | Who | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/company` | any signed-in user | none | `{ name, casePrefix, logo, updatedAt }` |
| PATCH | `/company` | see below | any of `{ name, casePrefix, logo }` | the company; a message that says what changed |

## Rules
- **Who:** `name` and `logo` need `branding` (Admin); `casePrefix` needs `operationalSettings` (Admin, Manager). A request that touches a field
  the caller can't change is refused whole (403, `PERMISSION_DENIED`) and the refusal is audited (`ok = false`).
- **Name:** 2 to 60 characters after trimming (the same as the screen's validator).
- **Case prefix:** 2 to 8 letters A to Z, upper-cased on the way in; no digits, spaces or symbols.
  Changing it **never rewrites existing case numbers**: a case ID is built when the case is created and stored. The response says so.
- **Logo:** a PNG or JPEG sent as a data URL (`data:image/png;base64,...`), **under 200 KB**. The declared type is not trusted: the decoded
  bytes must start with a real PNG or JPEG signature, so SVG (which can carry script), HTML and renamed files are refused with
  `LOGO_INVALID` and a message on `logo`. `""` removes the logo. The JSON body limit is 400 KB (`app.setup.ts`) to leave room for base64.
- Every real change is audited with the old and new values (the logo only as "replaced"/"removed").

## Tests
`test/settings.e2e-spec.ts` (company section).
