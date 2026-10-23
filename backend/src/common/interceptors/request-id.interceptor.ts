import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import type { Observable } from "rxjs";

import type { RequestContext } from "../interfaces/request-context";

/**
 * Returns the request id to the caller as `x-request-id`. The id itself is created by the HTTP logger
 * (it honours a sane incoming x-request-id, otherwise generates one), so logs and responses share it.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestContext>();
    if (request.id !== undefined) http.getResponse<Response>().setHeader("x-request-id", String(request.id));
    return next.handle();
  }
}
