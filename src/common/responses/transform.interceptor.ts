import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { map, type Observable } from "rxjs";

import type { RequestContext } from "../interfaces/request-context";
import { ApiResponse, CursorResponse, PaginatedResponse, type SuccessEnvelope } from "./api-response";

const DEFAULT_MESSAGES: Record<string, string> = {
  GET: "Loaded successfully.",
  POST: "Created successfully.",
  PUT: "Updated successfully.",
  PATCH: "Updated successfully.",
  DELETE: "Deleted successfully.",
};

/** Wraps every successful response in the standard envelope. */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<unknown>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((result) => {
        // A file download is the bytes themselves, not a JSON envelope.
        if (result instanceof StreamableFile) return result as never;
        const base = {
          success: true as const,
          statusCode: response.statusCode,
          timestamp: new Date().toISOString(),
          path: request.originalUrl,
        };
        const fallback = DEFAULT_MESSAGES[request.method] ?? "Done.";
        if (result instanceof PaginatedResponse) {
          return { ...base, message: result.message ?? fallback, data: result.items, meta: result.meta };
        }
        if (result instanceof CursorResponse) {
          return { ...base, message: result.message ?? fallback, data: result.items, meta: result.meta };
        }
        if (result instanceof ApiResponse) {
          return { ...base, message: result.message ?? fallback, data: result.data };
        }
        return { ...base, message: fallback, data: result ?? null };
      }),
    );
  }
}
