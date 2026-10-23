import { HttpException } from "@nestjs/common";

import type { ErrorCodeValue } from "../constants/error-codes";
import type { FieldError } from "../responses/api-response";

/**
 * Base class for every error the API raises on purpose. The message is written for the person using the app,
 * so it names the thing that went wrong. The global filter turns it into the standard error envelope.
 */
export class AppException extends HttpException {
  constructor(
    readonly errorCode: ErrorCodeValue,
    message: string,
    status: number,
    readonly errors?: FieldError[],
  ) {
    super({ errorCode, message, errors }, status);
  }
}
