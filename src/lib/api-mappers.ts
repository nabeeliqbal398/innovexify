/**
 * The single place that turns API records into the types the screens use (labels from `constants/vocab.ts`, timestamps as
 * milliseconds, calendar dates as `YYYY-MM-DD` text). Split by area under `lib/mappers/`; everything is re-exported here.
 */
export * from "./mappers/common";
export * from "./mappers/enums";
export * from "./mappers/session";
export * from "./mappers/people";
export * from "./mappers/cases";
export * from "./mappers/tasks";
export * from "./mappers/followups";
export * from "./mappers/documents";
export * from "./mappers/filings";
export * from "./mappers/reports";
export * from "./mappers/messages";
export * from "./mappers/announcements";
export * from "./mappers/tickets";
export * from "./mappers/notifications";
export * from "./mappers/dashboard";
export * from "./mappers/analytics";
export * from "./mappers/system";
