import { HttpStatus } from "@nestjs/common";

import { ErrorCode } from "../constants/error-codes";
import { AppException } from "./app.exception";

// ---- messages ---------------------------------------------------------------------------------------------------

export class ConversationReadOnlyException extends AppException {
  constructor(clientName: string, status: "SUSPENDED" | "REMOVED") {
    super(
      ErrorCode.CONVERSATION_READ_ONLY,
      status === "SUSPENDED"
        ? `${clientName}'s account is suspended, so this conversation is read-only. You can still read it; reactivate the account to send messages.`
        : `${clientName} was removed from the portal, so this conversation is read-only and no more messages can be sent.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class MessageHasNoAttachmentException extends AppException {
  constructor() {
    super(ErrorCode.MESSAGE_HAS_NO_ATTACHMENT, "That message has no attachment.", HttpStatus.CONFLICT);
  }
}

// ---- announcements ----------------------------------------------------------------------------------------------

export class AnnouncementNotDraftException extends AppException {
  constructor(title: string, status: "PUBLISHED" | "ARCHIVED") {
    super(
      ErrorCode.ANNOUNCEMENT_NOT_DRAFT,
      status === "PUBLISHED"
        ? `"${title}" is already published, so it can't be edited: clients may have read it. Archive it and publish a new one instead.`
        : `"${title}" is archived, so it can't be edited or published again. Create a new announcement instead.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class AnnouncementNotPublishedException extends AppException {
  constructor(title: string, status: "DRAFT" | "ARCHIVED") {
    super(
      ErrorCode.ANNOUNCEMENT_NOT_PUBLISHED,
      status === "DRAFT"
        ? `"${title}" is still a draft, so there is nothing to archive. Publish it, or edit it.`
        : `"${title}" is already archived.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class AnnouncementExpiryPastException extends AppException {
  constructor(expiresAt: string) {
    super(
      ErrorCode.ANNOUNCEMENT_EXPIRY_PAST,
      `The expiry date ${expiresAt} has already passed. Choose today or a later date, or leave it empty for no expiry.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "expiresAt", message: "Choose today or a later date." }],
    );
  }
}

export class AnnouncementAudienceInvalidException extends AppException {
  constructor(reason: "not-found" | "inactive") {
    const message =
      reason === "inactive"
        ? "That client isn't active (invited, suspended or removed), so they can't be sent an announcement. Choose an active client, or all clients."
        : "We couldn't find that client. Choose an active client, or all clients.";
    super(ErrorCode.ANNOUNCEMENT_AUDIENCE_INVALID, message, HttpStatus.UNPROCESSABLE_ENTITY, [{ field: "audienceId", message }]);
  }
}

export class AnnouncementAckNotRequiredException extends AppException {
  constructor(title: string) {
    super(ErrorCode.ANNOUNCEMENT_ACK_NOT_REQUIRED, `"${title}" doesn't ask for an acknowledgement, so there is nothing to confirm.`, HttpStatus.CONFLICT);
  }
}

// ---- tickets ----------------------------------------------------------------------------------------------------

export class TicketClosedException extends AppException {
  constructor(displayNumber: string, action: "reply" | "change" = "reply") {
    super(
      ErrorCode.TICKET_CLOSED,
      action === "reply"
        ? `${displayNumber} is closed, so it accepts no more replies. Open a new ticket if the problem is back.`
        : `${displayNumber} is closed, so it can't be changed. Open a new ticket if the problem is back.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidTicketHandlerException extends AppException {
  constructor() {
    super(
      ErrorCode.INVALID_TICKET_HANDLER,
      "A ticket can only be handled by an active staff member. Choose one, or take it yourself.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "handlerId", message: "Choose an active staff member." }],
    );
  }
}

export class TicketReopenWindowPassedException extends AppException {
  constructor(displayNumber: string, days: number) {
    super(
      ErrorCode.TICKET_REOPEN_WINDOW_PASSED,
      days === 0
        ? `${displayNumber} can't be reopened by the client. Open a new ticket, or ask the team to reopen it.`
        : `${displayNumber} was resolved more than ${days} day${days === 1 ? "" : "s"} ago, so it can no longer be reopened from here. Open a new ticket, or ask the team to reopen it.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class TicketEscalationNotAllowedException extends AppException {
  constructor(displayNumber: string, status: "RESOLVED" | "CLOSED") {
    super(
      ErrorCode.TICKET_ESCALATION_NOT_ALLOWED,
      `${displayNumber} is ${status === "RESOLVED" ? "resolved" : "closed"}, so it can't be escalated. Reopen it first if it needs more attention.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class TicketResolutionRequiredException extends AppException {
  constructor() {
    super(
      ErrorCode.TICKET_RESOLUTION_REQUIRED,
      "Say what fixed the problem before resolving the ticket. The client sees it.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "note", message: "Add the resolution notes." }],
    );
  }
}

export class TicketStatusStaffOnlyException extends AppException {
  constructor(statusLabel: string) {
    super(
      ErrorCode.TICKET_STATUS_STAFF_ONLY,
      `Only staff can set a ticket to "${statusLabel}". Reply to the ticket and the team will update it.`,
      HttpStatus.FORBIDDEN,
    );
  }
}

// ---- settings ---------------------------------------------------------------------------------------------------

export class LogoInvalidException extends AppException {
  constructor(message: string) {
    super(ErrorCode.LOGO_INVALID, message, HttpStatus.UNPROCESSABLE_ENTITY, [{ field: "logo", message }]);
  }
}

export class SecurityTriggerRequiredException extends AppException {
  constructor(name: string) {
    super(
      ErrorCode.SECURITY_TRIGGER_REQUIRED,
      `"${name}" is a security notification, so it is always on and can't be switched off.`,
      HttpStatus.CONFLICT,
    );
  }
}

export class TemplateNotAllowedException extends AppException {
  constructor(name: string, options: readonly string[]) {
    super(
      ErrorCode.TEMPLATE_NOT_ALLOWED,
      `That isn't an email template for "${name}". Choose one of: ${options.join(", ")}.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      [{ field: "template", message: `Choose one of: ${options.join(", ")}.` }],
    );
  }
}

export class ServiceStateException extends AppException {
  constructor(name: string, active: boolean) {
    super(
      ErrorCode.SERVICE_STATE_UNCHANGED,
      active ? `"${name}" is already active.` : `"${name}" is already switched off.`,
      HttpStatus.CONFLICT,
    );
  }
}
