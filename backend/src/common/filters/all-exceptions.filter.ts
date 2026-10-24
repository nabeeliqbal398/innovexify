import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { PinoLogger } from "nestjs-pino";

import { ErrorCode, type ErrorCodeValue } from "../constants/error-codes";
import { AppException } from "../exceptions/app.exception";
import type { RequestContext } from "../interfaces/request-context";
import type { ErrorEnvelope, FieldError } from "../responses/api-response";
import { mapPrismaError } from "../utils/prisma-errors";
import { redactUrl } from "../utils/redact";

interface Resolved {
  status: number;
  errorCode: ErrorCodeValue;
  message: string;
  errors?: FieldError[];
}

const STATUS_CODES: Record<number, { code: ErrorCodeValue; message: string }> = {
  400: { code: ErrorCode.BAD_REQUEST, message: "The request couldn't be understood. Check what you sent and try again." },
  401: { code: ErrorCode.UNAUTHENTICATED, message: "Sign in to continue. Your session is missing or has ended." },
  403: { code: ErrorCode.PERMISSION_DENIED, message: "Your role doesn't allow this action." },
  404: { code: ErrorCode.RESOURCE_NOT_FOUND, message: "That page or record doesn't exist." },
  413: { code: ErrorCode.PAYLOAD_TOO_LARGE, message: "That request is too large. Send less data, or a smaller file." },
  429: { code: ErrorCode.TOO_MANY_REQUESTS, message: "Too many requests in a short time. Wait a minute and try again." },
};

/**
 * Every error leaves the API in the same shape. Stack traces and internal messages never reach the client;
 * the full detail goes to the log with the request id and user id so support can find it.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = http.getResponse<Response>();
    const resolved = this.resolve(exception);

    const requestId = request.id === undefined ? undefined : String(request.id);
    const detail = {
      requestId,
      userId: request.user?.id,
      method: request.method,
      path: redactUrl(request.originalUrl),
      status: resolved.status,
      errorCode: resolved.errorCode,
    };
    if (resolved.status >= 500) {
      this.logger.error({ ...detail, err: exception }, resolved.message);
    } else {
      this.logger.warn(detail, resolved.message);
    }

    const body: ErrorEnvelope = {
      success: false,
      statusCode: resolved.status,
      errorCode: resolved.errorCode,
      message: resolved.message,
      ...(resolved.errors?.length ? { errors: resolved.errors } : {}),
      ...(requestId ? { requestId } : {}),
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };
    if (requestId) response.setHeader("x-request-id", requestId);
    response.status(resolved.status).json(body);
  }

  private resolve(exception: unknown): Resolved {
    if (exception instanceof AppException) {
      const payload = exception.getResponse() as { message: string; errors?: FieldError[] };
      return { status: exception.getStatus(), errorCode: exception.errorCode, message: payload.message, errors: payload.errors };
    }
    const prisma = mapPrismaError(exception);
    if (prisma) {
      const payload = prisma.getResponse() as { message: string; errors?: FieldError[] };
      return { status: prisma.getStatus(), errorCode: prisma.errorCode, message: payload.message, errors: payload.errors };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === HttpStatus.SERVICE_UNAVAILABLE) {
        return { status, errorCode: ErrorCode.SERVICE_UNAVAILABLE, message: exception.message };
      }
      const fallback = STATUS_CODES[status] ?? { code: ErrorCode.BAD_REQUEST, message: "The request couldn't be completed." };
      // Framework messages (such as "Cannot GET /x") are replaced with plain ones; throttling keeps its own.
      return { status, errorCode: fallback.code, message: fallback.message };
    }
    // Errors from the body parser are not HttpExceptions: a body over the limit, or JSON that doesn't parse.
    const type = (exception as { type?: unknown } | null)?.type;
    if (type === "entity.too.large") return { status: 413, errorCode: ErrorCode.PAYLOAD_TOO_LARGE, message: STATUS_CODES[413]?.message ?? "That request is too large." };
    if (type === "entity.parse.failed") return { status: 400, errorCode: ErrorCode.BAD_REQUEST, message: "The request body isn't valid JSON. Check what you sent and try again." };
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: "Something on our side went wrong. Your data is safe. Try again, and if it keeps happening, tell your administrator the time it occurred.",
    };
  }
}
