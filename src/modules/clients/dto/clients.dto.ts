import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CaseStage, CaseStatus, ContactPreference, Priority, UserStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";

import { FORMATION_STATES, LIMITS, PHONE_MESSAGE, PHONE_PATTERN } from "../../../common/constants/formation";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsIsoDate } from "../../../common/validators/iso-date";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const lower = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim().toLowerCase() : value);

const STATE_MESSAGE = `Choose a formation state: ${FORMATION_STATES.join(", ")}.`;

export const CLIENT_FILTERS = ["due", "invited", "waiting"] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number];

export class ListClientsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Matches name, email, business name or case ID." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus, { message: `status must be one of: ${Object.values(UserStatus).join(", ")}.` })
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'A CSR id, or "none" for clients without a CSR.' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "csrId must be a CSR id, or none." })
  @MaxLength(40, { message: "csrId is too long." })
  csrId?: string;

  @ApiPropertyOptional({ description: "Formation state." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "state must be a state name." })
  @MaxLength(40, { message: "state is too long." })
  state?: string;

  @ApiPropertyOptional({ enum: CLIENT_FILTERS, description: "due: has an open follow-up due today or earlier (that you can see). invited: invitation not accepted yet. waiting: owes the team a document or has a case waiting on them." })
  @IsOptional()
  @IsIn(CLIENT_FILTERS, { message: `filter must be one of: ${CLIENT_FILTERS.join(", ")}.` })
  filter?: ClientFilter;
}

export class CreateClientDto {
  @ApiPropertyOptional({ description: "Defaults to the part of the email before the @." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter the client's name." })
  @MaxLength(LIMITS.name, { message: `The name can't be longer than ${LIMITS.name} characters.` })
  name?: string;

  @ApiProperty({ example: "founder@newco.com" })
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254, { message: "That email address is too long." })
  email!: string;

  @ApiPropertyOptional({ description: 'The CSR who will look after the client, or "me". A CSR must name one; Admin and Manager may leave it empty.' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "csrId must be a CSR id." })
  @MaxLength(40, { message: "csrId is too long." })
  csrId?: string;

  @ApiPropertyOptional({ default: "llc", description: "Service catalog id for the first case." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "serviceId must be a service id." })
  @MaxLength(32, { message: "serviceId is too long." })
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter the business name." })
  @MaxLength(LIMITS.businessName, { message: `The business name can't be longer than ${LIMITS.businessName} characters.` })
  businessName?: string;

  @ApiPropertyOptional({ enum: FORMATION_STATES })
  @IsOptional()
  @Transform(trim)
  @IsIn(FORMATION_STATES, { message: STATE_MESSAGE })
  formationState?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.NORMAL })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional({ example: "2026-12-31", description: "Target date for the first case." })
  @IsOptional()
  @IsIsoDate({ message: "Enter a real target date as YYYY-MM-DD." })
  deadline?: string;

  @ApiPropertyOptional({ description: "A personal message included in the invitation email." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The note must be text." })
  @MaxLength(500, { message: "The note can't be longer than 500 characters." })
  note?: string;
}

export class UpdateClientProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter the business name." })
  @MaxLength(LIMITS.businessName, { message: `The business name can't be longer than ${LIMITS.businessName} characters.` })
  businessName?: string;

  @ApiPropertyOptional({ enum: FORMATION_STATES, description: "An empty string clears it." })
  @IsOptional()
  @Transform(trim)
  @IsIn(["", ...FORMATION_STATES], { message: STATE_MESSAGE })
  formationState?: string;

  @ApiPropertyOptional({ description: "An empty string clears it." })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((o: UpdateClientProfileDto) => o.phone !== undefined && o.phone !== "")
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter the address." })
  @MaxLength(LIMITS.address, { message: `The address can't be longer than ${LIMITS.address} characters.` })
  address?: string;

  @ApiPropertyOptional({ enum: ContactPreference })
  @IsOptional()
  @IsEnum(ContactPreference, { message: `contactPreference must be one of: ${Object.values(ContactPreference).join(", ")}.` })
  contactPreference?: ContactPreference;

  @ApiPropertyOptional({ description: "What the client likes to be called." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter the preferred name." })
  @MaxLength(LIMITS.preferredName, { message: `The preferred name can't be longer than ${LIMITS.preferredName} characters.` })
  preferredName?: string;
}

export class ChangeCsrDto {
  @ApiProperty({ description: 'The new CSR\'s id, or "me".' })
  @Transform(trim)
  @IsString({ message: "Choose a CSR." })
  @IsNotEmpty({ message: "Choose a CSR." })
  @MaxLength(40, { message: "csrId is too long." })
  csrId!: string;

  @ApiPropertyOptional({ description: "Why the client is being reassigned (kept in the audit log)." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The reason must be text." })
  @MaxLength(300, { message: "The reason can't be longer than 300 characters." })
  reason?: string;
}

export class CaseBriefDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ example: "PRJ-118" }) displayNumber!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty({ enum: CaseStage }) stage!: CaseStage;
  @ApiProperty({ enum: CaseStatus }) status!: CaseStatus;
  @ApiProperty({ enum: Priority }) priority!: Priority;
  @ApiProperty({ nullable: true, example: "2026-12-31" }) deadline!: string | null;
  @ApiProperty() lastActivityAt!: Date;
}

export class TimelineQueryDto {
  @ApiPropertyOptional({ default: true, description: "true: include the relationship entries (interactions, completed follow-ups, the invitation). Only Admin, Manager and CSR ever get them." })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === "true" ? true : value === "false" ? false : value))
  @IsBoolean({ message: "relationship must be true or false." })
  relationship?: boolean;

  @ApiPropertyOptional({ default: 40, description: "How many of the newest entries to return, 1 to 100." })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limit must be a whole number." })
  @Min(1, { message: "limit must be 1 or greater." })
  @Max(100, { message: "limit can't be more than 100." })
  limit?: number;
}

export const TIMELINE_KINDS = ["CASE", "DOCUMENT", "TICKET", "MESSAGE", "INTERACTION", "FOLLOW_UP", "INVITATION"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export class TimelineEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: TIMELINE_KINDS }) kind!: TimelineKind;
  @ApiProperty({ nullable: true, description: "For an interaction: CALL, EMAIL, PORTAL_MESSAGE or MEETING. For a document: its status key." }) subKind!: string | null;
  @ApiProperty() text!: string;
  @ApiProperty({ description: "A reason or remark. Empty when the viewer may not read it." }) note!: string;
  @ApiProperty({ nullable: true }) actor!: { id: string; name: string; role: string } | null;
  @ApiProperty() at!: Date;
}

export class ClientExtrasDto {
  @ApiProperty({ nullable: true, description: "The latest time the team reached the client: a staff message, a recorded interaction or a completed follow-up." })
  lastContactAt!: Date | null;

  @ApiProperty({ nullable: true, description: "The earliest open follow-up you can see for this client. Always null for Compliance." })
  nextFollowUp!: { id: string; due: string; type: string } | null;

  @ApiProperty({ description: "Five onboarding steps: accepted the invitation, gave contact details, has a case, case at document review or later, owes no documents." })
  onboarding!: { done: number; total: number };
}

export class ClientDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ example: "CASE-2026-0042" }) caseNumber!: string;
  @ApiProperty() businessName!: string;
  @ApiProperty() formationState!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ enum: ContactPreference }) contactPreference!: ContactPreference;
  @ApiProperty({ nullable: true }) csr!: { id: string; name: string } | null;
  @ApiProperty({ nullable: true }) joinedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true, type: CaseBriefDto, description: "The client's current case." }) case!: CaseBriefDto | null;
  @ApiPropertyOptional({ type: ClientExtrasDto, description: "Present on the list and the detail; not on the response to a create or edit." }) lastContactAt?: Date | null;
  @ApiPropertyOptional() nextFollowUp?: ClientExtrasDto["nextFollowUp"];
  @ApiPropertyOptional() onboarding?: ClientExtrasDto["onboarding"];
}

export class ClientDetailDto extends ClientDto {
  @ApiProperty() address!: string;
  @ApiProperty() preferredName!: string;
  @ApiProperty({ type: [CaseBriefDto] }) cases!: CaseBriefDto[];
  @ApiProperty() caseSummary!: { total: number; open: number; completed: number };
}

export class CreatedClientDto extends ClientDetailDto {
  @ApiProperty({ description: 'False when the client was created but the invitation email could not be sent: use "Resend invitation".' })
  invitationEmailSent!: boolean;

  @ApiProperty({ enum: ["sent", "failed", "switched-off"], description: '"switched-off": the "Client invited" trigger is off in Notifications & automation.' })
  invitationEmail!: "sent" | "failed" | "switched-off";
}
