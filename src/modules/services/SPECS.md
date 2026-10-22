# Services module (catalog)

## Purpose
The catalog of services a case can be opened for.

## Database models
`Service` (`id` a short slug, `name`, `category`, `description`, `requirements[]`, `stages[]`, `turnaround`, `fee`, `active`), `AuditLog` (category `settings`).

## Endpoints
Base `/api/v1`. Bearer token required.

| Method | Route | Who | Notes |
| --- | --- | --- | --- |
| GET | `/services` | any signed-in | a client sees only active services |
| GET | `/services/:id` | any signed-in | a switched-off service is a 404 for a client |
| POST | `/services` | `manageServices` (Admin, Manager) | the id is made from the name (`LLC formation` is `llc-formation`) |
| PATCH | `/services/:id` | `manageServices` | any field; an empty edit is refused |
| POST | `/services/:id/deactivate` | `manageServices` | clients stop seeing it; **cases already opened for it are not touched** |
| POST | `/services/:id/reactivate` | `manageServices` | |

## Rules
- Name 2 to 120, category 2 to 40, description 2 to 500, up to 30 requirements of up to 200 characters, at least one stage from the case stages.
- A name whose slug already exists is `DUPLICATE_RESOURCE` (409). A name with no letters or digits is refused.
- Switching off something already off (or on) is `SERVICE_STATE_UNCHANGED` (409), saying which.
- Every change is audited with the service id as target.

## Tests
`test/settings.e2e-spec.ts` (services section).
