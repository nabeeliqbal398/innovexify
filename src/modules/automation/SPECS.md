# Automation module (notification triggers)

## Purpose
Which events send an email, and with which template.

## Database models
`NotificationTrigger` (`key` one of `inv`, `msg`, `ticket`, `docreq`, `sec`; `name`, `enabled`, `template`, `templateOptions[]`, `security`), `AuditLog` (category `settings`).

## Endpoints
Base `/api/v1`. Bearer token required.

| Method | Route | Who | Request |
| --- | --- | --- | --- |
| GET | `/automation/triggers` | `operationalSettings` (Admin, Manager) | none |
| PATCH | `/automation/triggers/:key` | `enabled`: `manageTriggers` (Admin, Manager); `template`: `manageTemplates` (Admin) | `{ enabled?, template? }` |

## Rules
- **A switched-off trigger stops the email, never the in-app notification.** The notification is always created; `NotificationService.emailAfterCommit`
  checks the trigger before sending. Tests cover both halves (message sent with `msg` off: no email, one notification; back on: both).
- **The security trigger (`sec`) can't be switched off** (`SECURITY_TRIGGER_REQUIRED`, 409). Security emails (password changed, sessions revoked) go out regardless.
- **Templates** must be one of the trigger's `templateOptions` (`TEMPLATE_NOT_ALLOWED`, 422, listing them); the mail layer uses the chosen name.
- A request that includes a field the caller isn't allowed to change is refused whole and the refusal audited.
- An empty body, an unknown key (404) and a non-boolean `enabled` are refused with messages.

## Tests
`test/settings.e2e-spec.ts` (automation section).
