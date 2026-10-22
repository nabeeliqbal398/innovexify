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
  return { to: input.to, kind: "invitation", subject: `You're invited to ${input.companyName}`, text: lines.join("\n") };
}

export function emailChangedMail(input: { to: string; name: string; newEmail: string; companyName: string }): MailMessage {
  return {
    to: input.to,
    kind: "email-change",
    subject: `Your ${input.companyName} login email was changed`,
    text: `Hi ${input.name},\n\nThe login email on your ${input.companyName} account was changed to ${input.newEmail}. If you didn't expect this, contact your administrator.`,
  };
}

export function notificationMail(input: { to: string; name: string; text: string; companyName: string }): MailMessage {
  return {
    to: input.to,
    kind: "notification",
    subject: `${input.companyName}: ${input.text}`.slice(0, 200),
    text: `Hi ${input.name},\n\n${input.text}\n\nSign in to ${input.companyName} for details.`,
  };
}
