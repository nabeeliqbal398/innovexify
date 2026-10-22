import { ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";

import { ValidationFailedException } from "../exceptions/domain.exceptions";
import type { FieldError } from "../responses/api-response";

/**
 * When several rules fail on one field (a missing value fails "required", "is text" and "max length" at once) the
 * person should be told the most basic problem, not whichever decorator happened to run first.
 */
const CONSTRAINT_PRIORITY = ["isDefined", "isNotEmpty", "isString", "isBoolean", "isInt", "isNumber", "isIsoDate", "isEmail", "isEnum", "isIn", "isArray", "isObject"];
const rank = (constraint: string): number => {
  const i = CONSTRAINT_PRIORITY.indexOf(constraint);
  return i < 0 ? CONSTRAINT_PRIORITY.length : i;
};

function firstMessage(constraints: Record<string, string> | undefined): string[] {
  const entries = Object.entries(constraints ?? {});
  if (entries.length === 0) return [];
  // Array.prototype.sort is stable, so rules of equal rank keep their declared order.
  const [, message] = [...entries].sort(([a], [b]) => rank(a) - rank(b))[0];
  return [message];
}

/** Flatten nested class-validator errors into one entry per field, with dotted paths for nested objects. */
export function flattenValidationErrors(errors: ValidationError[], parent = ""): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = firstMessage(error.constraints).map((message) => ({ field, message }));
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

/** Global pipe: strips unknown fields, rejects extra ones, converts types, and reports every bad field. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => new ValidationFailedException(flattenValidationErrors(errors)),
  });
}
