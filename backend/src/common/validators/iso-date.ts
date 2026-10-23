import { registerDecorator, type ValidationOptions } from "class-validator";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD (2026-02-30 is rejected, not rolled over to March). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A calendar date with no time, as sent by date pickers. */
export function IsIsoDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: "isIsoDate",
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: "Enter a real date as YYYY-MM-DD.", ...options },
      validator: { validate: isIsoDate },
    });
}

/** The database stores dates (no time) as midnight UTC. */
export const dateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
export const formatDateOnly = (date: Date | null): string | null => (date ? date.toISOString().slice(0, 10) : null);
