import { HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { ErrorCode } from "../constants/error-codes";
import { AppException } from "../exceptions/app.exception";

/** "ClientProfile" -> "client profile". */
function words(model: string | undefined, fallback: string): string {
  if (!model) return fallback;
  return model.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** An expression index is reported as its expression, e.g. "lower(email::text)": the field is the column inside. */
function columnOfExpression(value: unknown): string {
  const text = String(value);
  return /^[a-z_]+\((\w+)(?:::\w+)?\)$/i.exec(text)?.[1] ?? text;
}

/** Prisma reports unique targets either as a list of columns or as a constraint name such as "User_email_key". */
function uniqueFields(target: unknown): string[] {
  if (Array.isArray(target)) return target.map(columnOfExpression);
  if (typeof target === "string") {
    const expression = columnOfExpression(target);
    if (expression !== target) return [expression];
    const match = /^[A-Za-z]+_(.+)_key$/.exec(target);
    return [(match?.[1] ?? target).replace(/_/g, ", ")];
  }
  return [];
}

/** "Case_clientId_fkey (index)" -> "clientId". */
function foreignKeyField(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const match = /^[A-Za-z]+_(.+)_fkey/.exec(text);
  return match?.[1] ?? text.replace(/ \(index\)$/, "");
}

/**
 * Turn a Prisma client error into an AppException whose message names the field or record involved,
 * or return null when the error isn't one we translate.
 */
export function mapPrismaError(error: unknown): AppException | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const model = typeof error.meta?.modelName === "string" ? error.meta.modelName : undefined;
    switch (error.code) {
      case "P2002": {
        const fields = uniqueFields(error.meta?.target);
        const field = fields.join(", ") || "value";
        const what = words(model, "record");
        return new AppException(
          ErrorCode.DUPLICATE_RESOURCE,
          `A ${what} with this ${field} already exists. Use a different ${field}, or open the existing ${what}.`,
          HttpStatus.CONFLICT,
          fields.map((f) => ({ field: f, message: `This ${f} is already in use.` })),
        );
      }
      case "P2025":
        return new AppException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `We couldn't find that ${words(model, "record")}. It may have been removed, or you may not have access to it.`,
          HttpStatus.NOT_FOUND,
        );
      case "P2003": {
        const field = foreignKeyField(error.meta?.field_name);
        return new AppException(
          ErrorCode.REFERENCE_CONSTRAINT,
          field
            ? `The ${field} you chose doesn't exist, or the record is still in use by other records. Pick an existing one, or remove what depends on it first.`
            : "This record refers to something that doesn't exist, or is still in use by other records.",
          HttpStatus.CONFLICT,
          field ? [{ field, message: "This reference isn't valid or is still in use." }] : undefined,
        );
      }
      case "P2014": {
        const a = words(typeof error.meta?.model_a_name === "string" ? error.meta.model_a_name : undefined, "record");
        const b = words(typeof error.meta?.model_b_name === "string" ? error.meta.model_b_name : undefined, "record");
        return new AppException(
          ErrorCode.RELATION_VIOLATION,
          `This change would break the required link between the ${a} and the ${b}. Update or remove the linked ${b} first.`,
          HttpStatus.CONFLICT,
        );
      }
      default:
        return null;
    }
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppException(ErrorCode.BAD_REQUEST, "Some of the information sent was in the wrong format. Check the fields and try again.", HttpStatus.BAD_REQUEST);
  }
  return null;
}
