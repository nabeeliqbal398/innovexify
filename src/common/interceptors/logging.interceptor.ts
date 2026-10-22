import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import { PinoLogger } from "nestjs-pino";
import { tap, type Observable } from "rxjs";

import type { RequestContext } from "../interfaces/request-context";

/** One structured log line per handled request: who, what, how long, and the outcome. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = http.getResponse<Response>();
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.info(
          {
            requestId: request.id,
            userId: request.user?.id,
            method: request.method,
            path: request.originalUrl,
            status: response.statusCode,
            ms: Date.now() - started,
          },
          "request completed",
        );
      }),
    );
  }
}
