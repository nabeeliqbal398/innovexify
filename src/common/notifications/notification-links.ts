/**
 * The only values a notification's `link` may hold: the names of the views the frontend can open (its navigation).
 * Never a URL, so a notification can't be used to send someone to another site. Anything else is stored as "" (no link).
 */
export const NOTIFICATION_LINKS = [
  "home", "overview", "clients", "cases", "staff", "projects", "tasks", "followups", "calendar", "filings",
  "documents", "messages", "reports", "announcements", "tickets", "services", "analytics", "automation", "security", "settings", "help",
  "cmsgs", "cdocs", "ctickets",
] as const;

export type NotificationLink = (typeof NOTIFICATION_LINKS)[number];

const ALLOWED: ReadonlySet<string> = new Set(NOTIFICATION_LINKS);

export const isNotificationLink = (value: string): value is NotificationLink => ALLOWED.has(value);

/** The link as stored: itself when it is an allowed view name, otherwise empty. */
export const safeLink = (value: string | undefined): string => (value && isNotificationLink(value) ? value : "");
