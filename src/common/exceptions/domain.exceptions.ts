import { HttpStatus } from "@nestjs/common";

import { ErrorCode } from "../constants/error-codes";
import type { FieldError } from "../responses/api-response";
import { AppException } from "./app.exception";

export class ValidationFailedException extends AppException {
  constructor(errors: FieldError[]) {
    const first = errors[0];
    const message =
      errors.length === 1 && first
        ? `${first.message}`
        : `Please fix ${errors.length} fields and try again: ${errors.map((e) => e.field).join(", ")}.`;
    super(ErrorCode.VALIDATION_FAILED, message, HttpStatus.UNPROCESSABLE_ENTITY, errors);
  }
}

export class ResourceNotFoundException extends AppException {
  constructor(resource: string, identifier?: string | number) {
    const which = identifier === undefined ? "" : ` "${identifier}"`;
    super(
      ErrorCode.RESOURCE_NOT_FOUND,
      `We couldn't find the ${resource}${which}. It may have been removed, or you may not have access to it.`,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DuplicateResourceException extends AppException {
  constructor(resource: string, field: string, value?: string) {
    const shown = value ? ` "${value}"` : "";
    super(
      ErrorCode.DUPLICATE_RESOURCE,
      `A ${resource} with this ${field}${shown} already exists. Use a different ${field}, or open the existing ${resource}.`,
      HttpStatus.CONFLICT,
      [{ field, message: `This ${field} is already in use.` }],
    );
  }
}

export class InvalidCredentialsException extends AppException {
  constructor() {
    // Deliberately vague about which half was wrong, so the endpoint can't be used to discover accounts.
    super(ErrorCode.INVALID_CREDENTIALS, "That email and password don't match. Check both and try again.", HttpStatus.UNAUTHORIZED);
  }
}

export class CurrentPasswordIncorrectException extends AppException {
  constructor() {
    super(ErrorCode.CURRENT_PASSWORD_INCORRECT, "The current password you entered is incorrect.", HttpStatus.BAD_REQUEST, [
      { field: "currentPassword", message: "That isn't your current password." },
    ]);
  }
}

export class PasswordUnchangedException extends AppException {
  constructor() {
    super(ErrorCode.PASSWORD_UNCHANGED, "The new password must be different from your current one.", HttpStatus.UNPROCESSABLE_ENTITY, [
      { field: "newPassword", message: "Choose a password you haven't used here as your current one." },
    ]);
  }
}

export class AccountLockedException extends AppException {
  constructor(minutes: number) {
    super(
      ErrorCode.ACCOUNT_LOCKED,
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class AccountInactiveException extends AppException {
  constructor(status: string) {
    super(
      ErrorCode.ACCOUNT_INACTIVE,
      status === "Suspended"
        ? "This account is suspended. Ask your administrator to reactivate it."
        : "This account can't sign in. Contact your administrator.",
      HttpStatus.FORBIDDEN,
    );
  }
}

export class UnauthenticatedException extends AppException {
  constructor(message = "Sign in to continue. Your session is missing or has ended.") {
    super(ErrorCode.UNAUTHENTICATED, message, HttpStatus.UNAUTHORIZED);
  }
}

export class TokenExpiredException extends AppException {
  constructor() {
    super(ErrorCode.TOKEN_EXPIRED, "Your session has expired. Sign in again to continue.", HttpStatus.UNAUTHORIZED);
  }
}

export class TokenInvalidException extends AppException {
  constructor(what = "session") {
    super(ErrorCode.TOKEN_INVALID, `This ${what} token isn't valid. Sign in again to continue.`, HttpStatus.UNAUTHORIZED);
  }
}

export class TokenReuseDetectedException extends AppException {
  constructor() {
    super(
      ErrorCode.TOKEN_REUSE_DETECTED,
      "This sign-in was already used, so all sessions from it were ended to keep your account safe. Sign in again.",
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class PermissionDeniedException extends AppException {
  constructor(message = "Your role doesn't allow this action.") {
    super(ErrorCode.PERMISSION_DENIED, message, HttpStatus.FORBIDDEN);
  }
}

export class InvalidStateTransitionException extends AppException {
  constructor(resource: string, from: string, to: string, reason?: string) {
    super(
      ErrorCode.INVALID_STATE_TRANSITION,
      `A ${resource} can't move from "${from}" to "${to}".${reason ? ` ${reason}` : ""}`,
      HttpStatus.CONFLICT,
    );
  }
}

export class FilingNumberRequiredException extends AppException {
  constructor() {
    super(
      ErrorCode.FILING_NUMBER_REQUIRED,
      "A state approval can only be recorded with the state's own confirmation number. Enter it and try again.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "filingConfirmation", message: "Enter the confirmation number issued by the state." }],
    );
  }
}

export class DuplicateDocumentRequestException extends AppException {
  constructor(documentName: string) {
    super(
      ErrorCode.DUPLICATE_DOCUMENT_REQUEST,
      `"${documentName}" is already requested from this client in Documents. Follow up on that request instead of adding a duplicate.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class InvitationExpiredException extends AppException {
  constructor() {
    super(
      ErrorCode.INVITATION_EXPIRED,
      "This invitation has expired. Ask the person who invited you to send a new one.",
      HttpStatus.GONE,
    );
  }
}

export class InvitationUsedException extends AppException {
  constructor() {
    super(
      ErrorCode.INVITATION_USED,
      "This invitation was already used to set up an account. Sign in with your email and password instead.",
      HttpStatus.CONFLICT,
    );
  }
}

export class InvitationInvalidException extends AppException {
  constructor() {
    super(
      ErrorCode.INVITATION_INVALID,
      "This invitation link isn't valid. It may have been copied incompletely. Open it straight from your email.",
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ConcurrentModificationException extends AppException {
  constructor(resource: string) {
    super(
      ErrorCode.CONCURRENT_MODIFICATION,
      `Someone else changed this ${resource} while you were working on it, so your change was not saved. Refresh to see the latest version, then try again.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class EmailInUseException extends AppException {
  constructor(email: string) {
    super(
      ErrorCode.EMAIL_IN_USE,
      `The email ${email} already belongs to an account or a pending invitation. Use a different email, or open the existing account.`,
      HttpStatus.CONFLICT,
      [{ field: "email", message: "This email is already in use." }],
    );
  }
}

export class EmailUnchangedException extends AppException {
  constructor(email: string) {
    super(ErrorCode.EMAIL_UNCHANGED, `${email} is already this account's email. Enter a different address to change it.`, HttpStatus.UNPROCESSABLE_ENTITY, [
      { field: "email", message: "That's the current email." },
    ]);
  }
}

export class SelfActionNotAllowedException extends AppException {
  constructor(action: "suspend" | "remove") {
    super(
      ErrorCode.SELF_ACTION_NOT_ALLOWED,
      action === "suspend"
        ? "You can't suspend your own account. Ask another Admin or Manager to do it if it is really needed."
        : "You can't remove your own account. Ask another Admin to do it if it is really needed.",
      HttpStatus.CONFLICT,
    );
  }
}

export class LastAdminException extends AppException {
  constructor(action: "suspend" | "remove") {
    super(
      ErrorCode.LAST_ADMIN_PROTECTED,
      `You can't ${action} the last active Admin. Invite or reactivate another Admin first so the portal always has an owner.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class ReassignmentRequiredException extends AppException {
  constructor(name: string, clients: number, openTasks: number) {
    const parts: string[] = [];
    if (clients) parts.push(`${clients} assigned client${clients === 1 ? "" : "s"}`);
    if (openTasks) parts.push(`${openTasks} open task${openTasks === 1 ? "" : "s"}`);
    const what = clients && openTasks ? "them" : clients ? "the clients" : "the tasks";
    super(
      ErrorCode.REASSIGNMENT_REQUIRED,
      `${name} still has ${parts.join(" and ")}. Reassign ${what} before removing this account, so nothing is left without an owner.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class UserRemovedException extends AppException {
  constructor(name: string) {
    super(ErrorCode.USER_REMOVED, `${name} was removed from the portal, so this account is read-only and can't be changed.`, HttpStatus.CONFLICT);
  }
}

export class InvalidInviteRoleException extends AppException {
  constructor(message: string) {
    super(ErrorCode.INVALID_INVITE_ROLE, message, HttpStatus.UNPROCESSABLE_ENTITY, [{ field: "role", message }]);
  }
}

export class InvitationNotPendingException extends AppException {
  constructor(name: string, status: string) {
    super(
      ErrorCode.INVITATION_NOT_PENDING,
      `${name} has no pending invitation (the account is ${status.toLowerCase()}). Only people who haven't accepted yet can be re-invited.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidCsrAssignmentException extends AppException {
  constructor(reason: "not-found" | "not-csr" | "inactive") {
    const message =
      reason === "inactive"
        ? "That CSR isn't active (suspended, invited or removed), so clients can't be assigned to them. Choose an active CSR."
        : reason === "not-csr"
          ? "Only users with the CSR role can be assigned to a client. Choose an active CSR."
          : "We couldn't find that CSR. Choose an existing, active CSR.";
    super(ErrorCode.INVALID_CSR_ASSIGNMENT, message, HttpStatus.UNPROCESSABLE_ENTITY, [{ field: "csrId", message }]);
  }
}

export class CsrRequiredException extends AppException {
  constructor() {
    super(
      ErrorCode.CSR_REQUIRED,
      "Assign the client to yourself or another active CSR. A CSR can't invite a client who would be left without one.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "csrId", message: "Choose a CSR for this client." }],
    );
  }
}

export class CsrUnchangedException extends AppException {
  constructor(clientName: string, csrName: string) {
    super(ErrorCode.CSR_UNCHANGED, `${csrName} is already the CSR for ${clientName}. Choose a different CSR to reassign.`, HttpStatus.UNPROCESSABLE_ENTITY, [
      { field: "csrId", message: "This CSR is already assigned." },
    ]);
  }
}

export class CaseAlreadyExistsException extends AppException {
  constructor(clientCaseNumber: string) {
    super(
      ErrorCode.CASE_ALREADY_EXISTS,
      `${clientCaseNumber} already has a case. A client has one case at a time; update that one instead.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class CaseCompletedException extends AppException {
  constructor(displayNumber: string) {
    super(
      ErrorCode.CASE_COMPLETED,
      `${displayNumber} is completed, so it can't be edited or moved to another stage. You can still add notes to it.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class CaseDeletedException extends AppException {
  constructor(displayNumber: string) {
    super(ErrorCode.CASE_DELETED, `${displayNumber} was removed (its client was removed from the portal), so it is read-only.`, HttpStatus.CONFLICT);
  }
}

export class ServiceInactiveException extends AppException {
  constructor(serviceName: string) {
    super(
      ErrorCode.SERVICE_INACTIVE,
      `The service "${serviceName}" is switched off in the service catalog, so new work can't be opened for it. Choose an active service.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "serviceId", message: "This service is not active." }],
    );
  }
}

export class InvalidCaseOwnerException extends AppException {
  constructor() {
    super(
      ErrorCode.INVALID_CASE_OWNER,
      "The compliance owner must be an active Compliance user. Choose one, or clear the owner.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "ownerId", message: "Choose an active Compliance user." }],
    );
  }
}

export class RollbackReasonRequiredException extends AppException {
  constructor(from: string, to: string) {
    super(
      ErrorCode.ROLLBACK_REASON_REQUIRED,
      `Moving a case back from "${from}" to "${to}" needs a reason, so the team can see why. Add a note and try again.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "note", message: "Explain why the case is moving back." }],
    );
  }
}
