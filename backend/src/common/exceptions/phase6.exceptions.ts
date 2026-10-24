import { HttpStatus } from "@nestjs/common";

import { ErrorCode } from "../constants/error-codes";
import { AppException } from "./app.exception";

export class PasswordResetExpiredException extends AppException {
  constructor() {
    super(ErrorCode.PASSWORD_RESET_EXPIRED, "This password reset link has expired. Request a new one from the sign-in page.", HttpStatus.GONE);
  }
}

export class PasswordResetUsedException extends AppException {
  constructor() {
    super(ErrorCode.PASSWORD_RESET_USED, "This password reset link was already used. If you still can't sign in, request a new one.", HttpStatus.CONFLICT);
  }
}

/** Unknown token, or one that belongs to an account that can no longer reset (suspended, removed): the two look the same. */
export class PasswordResetInvalidException extends AppException {
  constructor() {
    super(ErrorCode.PASSWORD_RESET_INVALID, "This password reset link isn't valid. It may have been copied incompletely. Open it straight from your email, or request a new one.", HttpStatus.NOT_FOUND);
  }
}
