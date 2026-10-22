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
  constructor(kind: "stage" | "approved" = "stage") {
    super(
      ErrorCode.FILING_NUMBER_REQUIRED,
      kind === "stage"
        ? "A state approval can only be recorded with the state's own confirmation number. Enter it and try again."
        : "Approved filings need the reference number issued by the state. Enter it and try again.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      kind === "stage"
        ? [{ field: "filingConfirmation", message: "Enter the confirmation number issued by the state." }]
        : [{ field: "reference", message: "Enter the reference number issued by the state." }],
    );
  }
}

export class DuplicateDocumentRequestException extends AppException {
  constructor(name: string, context: "task" | "request" = "task") {
    super(
      ErrorCode.DUPLICATE_DOCUMENT_REQUEST,
      context === "task"
        ? `"${name}" is already requested from this client in Documents. Follow up on that request instead of adding a duplicate task.`
        : `"${name}" is already requested from this client and is still open in Documents. Follow up on that request instead of requesting it again.`,
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
      `${clientCaseNumber} already has an open case. A client can have a new case once their current one is completed; until then, update that one instead.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class CaseCompletedException extends AppException {
  constructor(displayNumber: string, what: "edit" | "task" | "filing" = "edit") {
    const message =
      what === "task"
        ? `${displayNumber} is completed, so no new tasks can be added to it. Open a new case if there is more work to do.`
        : what === "filing"
          ? `${displayNumber} is completed, so no new filings can be added to it. You can still view its existing filings.`
          : `${displayNumber} is completed, so it can't be edited or moved to another stage. You can still add notes to it.`;
    super(ErrorCode.CASE_COMPLETED, message, HttpStatus.CONFLICT);
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

// ---- tasks -----------------------------------------------------------------------------------------------------

export class InvalidTaskAssigneeException extends AppException {
  constructor() {
    super(
      ErrorCode.INVALID_TASK_ASSIGNEE,
      "Assign the task to an active staff member. Clients, and suspended or removed accounts, can't be given tasks.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "assigneeId", message: "Choose an active staff member." }],
    );
  }
}

export class TaskAssigneeNotAllowedException extends AppException {
  constructor(roleLabel: string) {
    super(
      ErrorCode.TASK_ASSIGNEE_NOT_ALLOWED,
      `As ${roleLabel} you can give tasks to yourself only. Ask an Admin or Manager to assign it to someone else.`,
      HttpStatus.FORBIDDEN,
      [{ field: "assigneeId", message: "You can only assign tasks to yourself." }],
    );
  }
}

export class TaskDueDateInvalidException extends AppException {
  constructor(due: string) {
    super(
      ErrorCode.TASK_DUE_DATE_INVALID,
      `${due} is too far in the past to be a due date. Choose a date from 1 January 2020 onwards.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "due", message: "Choose a date from 1 January 2020 onwards." }],
    );
  }
}

export class TaskDeleteNotAllowedException extends AppException {
  constructor() {
    super(ErrorCode.TASK_DELETE_NOT_ALLOWED, "Only the person who created a task, or an Admin or Manager, can delete it.", HttpStatus.FORBIDDEN);
  }
}

// ---- follow-ups ------------------------------------------------------------------------------------------------

export class FollowUpDoneException extends AppException {
  constructor(action: "edit" | "delete" | "complete") {
    super(
      ErrorCode.FOLLOWUP_DONE,
      action === "edit"
        ? "This follow-up is already done, so it can't be edited. Record a new follow-up instead."
        : action === "complete"
          ? "This follow-up was already completed, and its outcome is on the client's timeline. Nothing was changed."
          : "Only open follow-ups can be deleted. A completed one stays in the client's history.",
      HttpStatus.CONFLICT,
    );
  }
}

export class FollowUpDateInPastException extends AppException {
  constructor() {
    super(ErrorCode.FOLLOWUP_DATE_IN_PAST, "A follow-up can't be due before today. Choose today or a later date.", HttpStatus.UNPROCESSABLE_ENTITY, [
      { field: "due", message: "Choose today or a later date." },
    ]);
  }
}

export class FollowUpOutcomeRequiredException extends AppException {
  constructor() {
    super(
      ErrorCode.FOLLOWUP_OUTCOME_REQUIRED,
      "Record what happened before marking the follow-up done. It is added to the client's timeline.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "outcome", message: "Record what happened." }],
    );
  }
}

// ---- documents and files ---------------------------------------------------------------------------------------

export class DocumentReasonRequiredException extends AppException {
  constructor(decision: "REJECTED" | "INFO") {
    super(
      ErrorCode.DOCUMENT_REASON_REQUIRED,
      decision === "REJECTED"
        ? "Add the reason this document is being rejected. The client will see it."
        : "Say what extra information you need. The client will see it.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "reason", message: "Add a reason the client will see." }],
    );
  }
}

export class DocumentHasNoFileException extends AppException {
  constructor(name: string) {
    super(ErrorCode.DOCUMENT_HAS_NO_FILE, `There is no file on "${name}" yet: the client hasn't uploaded one.`, HttpStatus.CONFLICT);
  }
}

export class DocumentDeletedException extends AppException {
  constructor(name: string) {
    super(ErrorCode.DOCUMENT_DELETED, `"${name}" was deleted, so it is read-only.`, HttpStatus.CONFLICT);
  }
}

export class DocumentUploadNotAllowedException extends AppException {
  constructor() {
    super(
      ErrorCode.DOCUMENT_UPLOAD_NOT_ALLOWED,
      "Only the client can upload a file against a request. To send a finished document to a client, use Share.",
      HttpStatus.FORBIDDEN,
    );
  }
}

export class FileRequiredException extends AppException {
  constructor() {
    super(ErrorCode.FILE_REQUIRED, "Choose a file to upload.", HttpStatus.UNPROCESSABLE_ENTITY, [{ field: "file", message: "Choose a file." }]);
  }
}

export class FileEmptyException extends AppException {
  constructor(name: string) {
    super(ErrorCode.FILE_EMPTY, `"${name}" is empty (0 bytes). Check the file and choose it again.`, HttpStatus.UNPROCESSABLE_ENTITY, [
      { field: "file", message: "That file is empty." },
    ]);
  }
}

export class FileTooLargeException extends AppException {
  constructor(maxMb: number) {
    super(ErrorCode.FILE_TOO_LARGE, `That file is larger than ${maxMb} MB. Compress it or split it into parts.`, HttpStatus.PAYLOAD_TOO_LARGE, [
      { field: "file", message: `Files can be up to ${maxMb} MB.` },
    ]);
  }
}

export class FileTypeNotAllowedException extends AppException {
  constructor(extension: string) {
    super(
      ErrorCode.FILE_TYPE_NOT_ALLOWED,
      `That file type isn't accepted${extension ? ` (.${extension})` : ""}. Use PDF, PNG, JPG or DOCX.`,
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      [{ field: "file", message: "Use a PDF, PNG, JPG or DOCX file." }],
    );
  }
}

export class FileDoubleExtensionException extends AppException {
  constructor(name: string) {
    super(
      ErrorCode.FILE_DOUBLE_EXTENSION,
      `"${name}" has more than one file extension, which is a common way to disguise a program as a document. Rename it with a single extension, such as .pdf, and upload it again.`,
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      [{ field: "file", message: "Use a file name with a single extension." }],
    );
  }
}

export class FileContentNotAllowedException extends AppException {
  constructor(name: string) {
    super(
      ErrorCode.FILE_CONTENT_NOT_ALLOWED,
      `The contents of "${name}" aren't a PDF, PNG, JPG or DOCX file, whatever its name says. It was not accepted.`,
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      [{ field: "file", message: "The file's contents aren't an accepted type." }],
    );
  }
}

export class FileTypeMismatchException extends AppException {
  constructor(name: string, extension: string, actual: string) {
    super(
      ErrorCode.FILE_TYPE_MISMATCH,
      `"${name}" is named as a .${extension} file but its contents are ${actual}. Save it in the right format, or rename it, and upload it again.`,
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      [{ field: "file", message: `The file looks like ${actual}, not .${extension}.` }],
    );
  }
}

export class FileNameInvalidException extends AppException {
  constructor() {
    super(ErrorCode.FILE_NAME_INVALID, "That file has no usable name once folders and special characters are removed. Rename it and try again.", HttpStatus.UNPROCESSABLE_ENTITY, [
      { field: "file", message: "Rename the file." },
    ]);
  }
}

export class FileRejectedByScanException extends AppException {
  constructor(name: string, reason?: string) {
    super(
      ErrorCode.FILE_REJECTED_BY_SCAN,
      `"${name}" was blocked by the security scan${reason ? ` (${reason})` : ""}. It was not stored. If you think this is a mistake, contact your administrator.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "file", message: "The file did not pass the security scan." }],
    );
  }
}

export class StorageFailedException extends AppException {
  constructor() {
    super(
      ErrorCode.STORAGE_FAILED,
      "We couldn't save the file, so nothing was changed. Try again, and if it keeps happening, tell your administrator.",
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

// ---- filings, reports ------------------------------------------------------------------------------------------

export class FilingDateInFutureException extends AppException {
  constructor() {
    super(
      ErrorCode.FILING_DATE_IN_FUTURE,
      "The submission date can't be in the future. Enter the day the filing was actually submitted.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "submittedOn", message: "Enter a date that isn't in the future." }],
    );
  }
}

export class FilingReasonRequiredException extends AppException {
  constructor(from: string, to: string) {
    super(
      ErrorCode.FILING_REASON_REQUIRED,
      `Moving a filing back from "${from}" to "${to}" needs a reason, so the team can see why. Add one and try again.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "reason", message: "Explain why the filing is moving back." }],
    );
  }
}

export class ReportClosedException extends AppException {
  constructor(displayNumber: string) {
    super(
      ErrorCode.REPORT_CLOSED,
      `${displayNumber} was marked resolved, so it accepts no more replies. Submit a new report if there is something new to raise.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class CaseClientMismatchException extends AppException {
  constructor(caseDisplay: string, clientName: string) {
    super(
      ErrorCode.CASE_CLIENT_MISMATCH,
      `${caseDisplay} doesn't belong to ${clientName}. Choose one of their cases, or leave the case empty.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "caseId", message: "This case belongs to a different client." }],
    );
  }
}

export class FilingSubmissionDateRequiredException extends AppException {
  constructor(statusLabel: string) {
    super(
      ErrorCode.FILING_SUBMISSION_DATE_REQUIRED,
      `A filing marked "${statusLabel}" needs the date it was submitted. Enter the submission date.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "submittedOn", message: "Enter the submission date." }],
    );
  }
}
