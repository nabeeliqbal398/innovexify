import type { Role } from "@prisma/client";

import type { MailMessage } from "./mail.service";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "an Admin",
  MANAGER: "a Manager",
  CSR: "a CSR",
  COMPLIANCE: "a Compliance user",
  CLIENT: "a client",
};

export interface InvitationMailInput {
  template?: string;
  to: string;
  name: string;
  role: Role;
  companyName: string;
  invitedBy: string;
  url: string;
  expiresAt: Date;
  note?: string;
  caseNumber?: string | null;
}

export function invitationMail(input: InvitationMailInput): MailMessage {
  const lines = [
    `Hi ${input.name},`,
    "",
    `${input.invitedBy} invited you to ${input.companyName} as ${ROLE_LABEL[input.role]}.`,
    ...(input.caseNumber ? [`Your case ID is ${input.caseNumber}.`] : []),
    ...(input.note ? ["", `Message from ${input.invitedBy}: ${input.note}`] : []),
    "",
    `Set your password and sign in: ${input.url}`,
    `This link works once and expires on ${input.expiresAt.toUTCString()}.`,
  ];
  return { to: input.to, kind: "invitation", template: input.template, subject: `You're invited to ${input.companyName}`, text: lines.join("\n") };
}

export function emailChangedMail(input: { to: string; name: string; newEmail: string; companyName: string }): MailMessage {
  return {
    to: input.to,
    kind: "email-change",
    subject: `Your ${input.companyName} login email was changed`,
    text: `Hi ${input.name},\n\nThe login email on your ${input.companyName} account was changed to ${input.newEmail}. If you didn't expect this, contact your administrator.`,
  };
}

export function notificationMail(input: { to: string; name: string; text: string; companyName: string; template?: string }): MailMessage {
  return {
    to: input.to,
    kind: "notification",
    template: input.template,
    subject: `${input.companyName}: ${input.text}`.slice(0, 200),
    text: `Hi ${input.name},\n\n${input.text}\n\nSign in to ${input.companyName} for details.`,
  };
}

export function passwordResetMail(input: { to: string; name: string; companyName: string; url: string; expiresInMinutes: number }): MailMessage {
  return {
    to: input.to,
    kind: "password-reset",
    subject: `Reset your ${input.companyName} password`,
    text: [
      `Hi ${input.name},`,
      "",
      `We received a request to reset the password on your ${input.companyName} account.`,
      `Choose a new password: ${input.url}`,
      `This link works once and expires in ${input.expiresInMinutes} minutes.`,
      "",
      "If you did not ask for this, ignore this email: your password has not changed.",
    ].join("\n"),
  };
}

/** Always sent after a reset (a security notice, not a notification a person can switch off). */
export function passwordChangedMail(input: { to: string; name: string; companyName: string; at: Date }): MailMessage {
  return {
    to: input.to,
    kind: "password-changed",
    subject: `Your ${input.companyName} password was changed`,
    text: [
      `Hi ${input.name},`,
      "",
      `The password on your ${input.companyName} account was changed on ${input.at.toUTCString()}, and every device was signed out.`,
      "If this was you, nothing more is needed.",
      "If it was not you, reset your password straight away from the sign-in page and tell your administrator.",
    ].join("\n"),
  };
}
