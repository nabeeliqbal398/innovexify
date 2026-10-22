import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException } from "@nestjs/common";
import { catchError, throwError, type Observable } from "rxjs";

import { AppConfig } from "../../config/app-config";
import { FileRequiredException, FileTooLargeException } from "../exceptions";

/**
 * Put BEFORE FileInterceptor on an upload route. Multer reports an oversized file or a wrongly named form field as
 * generic 413 / 400 errors; this turns them into the specific messages everything else in the API uses.
 */
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  constructor(private readonly config: AppConfig) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof PayloadTooLargeException) return throwError(() => new FileTooLargeException(this.config.env.MAX_UPLOAD_MB));
        if (error instanceof BadRequestException && /unexpected field|multipart|boundary/i.test(error.message)) {
          return throwError(() => new FileRequiredException());
        }
        return throwError(() => error);
      }),
    );
  }
}
