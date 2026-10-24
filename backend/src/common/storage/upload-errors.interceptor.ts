import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException } from "@nestjs/common";
import { catchError, throwError, type Observable } from "rxjs";

import { AppConfig } from "../../config/app-config";
import { FileRequiredException, FileTooLargeException } from "../exceptions";

/** The part of multer's error that matters. Its `code` is stable; its message text has changed between releases. */
interface MulterLikeError {
  name: string;
  code?: string;
  message: string;
}

const isMulterError = (error: unknown): error is MulterLikeError => error instanceof Error && error.name === "MulterError";

/**
 * Put BEFORE FileInterceptor on an upload route. Multer reports an oversized file or a wrongly named form field as
 * generic 413 / 400 errors; this turns them into the specific messages everything else in the API uses.
 *
 * Nest decides what a multer error means by comparing multer's message text, which changes between multer releases (a security
 * update renamed "Unexpected field" to "Unexpected file field" and the error then came out as a 500). So this looks at multer's
 * error `code` too, and anything Nest could not translate becomes a 400, never a 500.
 */
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  constructor(private readonly config: AppConfig) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof PayloadTooLargeException) return throwError(() => new FileTooLargeException(this.config.env.MAX_UPLOAD_MB));
        if (error instanceof BadRequestException && /unexpected (file )?field|multipart|boundary/i.test(error.message)) {
          return throwError(() => new FileRequiredException());
        }
        if (isMulterError(error)) {
          if (error.code === "LIMIT_FILE_SIZE") return throwError(() => new FileTooLargeException(this.config.env.MAX_UPLOAD_MB));
          if (error.code === "LIMIT_UNEXPECTED_FILE") return throwError(() => new FileRequiredException());
          return throwError(() => new BadRequestException(error.message));
        }
        return throwError(() => error);
      }),
    );
  }
}
