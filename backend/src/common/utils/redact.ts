/**
 * Links that carry a one-time secret in the path. A log line that kept the full path would keep a working invitation or
 * password-reset link for anyone who can read the logs, so the secret segment is replaced before a path is logged.
 */
const SECRET_PATHS = /(\/auth\/(?:invitations|reset-password)\/)[^/?#\s]+/gi;

export function redactUrl(url: string | undefined): string {
  return (url ?? "").replace(SECRET_PATHS, "$1[REDACTED]");
}
