import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Priority, Role, TicketCategory, TicketStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from "class-validator";

import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const toBoolean = ({ value }: { value: unknown }): unknown => (value === "true" ? true : value === "false" ? false : value);
const VERSION_MESSAGE = "Send the version you loaded (version), so we can tell if someone else changed the ticket since.";

export const TICKET_GROUPS = ["active", "finished"] as const;

export class ListTicketsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TICKET_GROUPS, description: "active: not yet resolved or closed. finished: resolved or closed." })
  @IsOptional()
  @IsIn(TICKET_GROUPS, { message: "group must be active or finished." })
  group?: (typeof TICKET_GROUPS)[number];

  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus, { message: `status must be one of: ${Object.values(TicketStatus).join(", ")}.` })
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional({ enum: TicketCategory })
  @IsOptional()
  @IsEnum(TicketCategory, { message: `category must be one of: ${Object.values(TicketCategory).join(", ")}.` })
  category?: TicketCategory;

  @ApiPropertyOptional({ description: 'A staff member\'s id, or "none" for unassigned tickets.' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "handlerId must be a user id, or none." })
  @MaxLength(40, { message: "handlerId is too long." })
  handlerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "clientId must be a client id." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId?: string;

  @ApiPropertyOptional({ description: "true: escalated tickets only. false: the rest. Staff only." })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: "escalated must be true or false." })
  escalated?: boolean;

  @ApiPropertyOptional({ description: "Matches the title, the client's name, or a number like TKT-1004." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;
}

export class CreateTicketDto {
  @ApiPropertyOptional({ description: "Staff opening a ticket on a client's behalf: that client's id. A client leaves it out (or sends their own id)." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "clientId must be a client id." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId?: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString({ message: "Enter a subject." })
  @IsNotEmpty({ message: "Enter a subject." })
  @MaxLength(200, { message: "The subject can't be longer than 200 characters." })
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @Transform(trim)
  @IsString({ message: "Describe the issue." })
  @IsNotEmpty({ message: "Describe the issue." })
  @MaxLength(5000, { message: "The description can't be longer than 5000 characters." })
  description!: string;

  @ApiProperty({ enum: TicketCategory })
  @IsEnum(TicketCategory, { message: `category must be one of: ${Object.values(TicketCategory).join(", ")}.` })
  category!: TicketCategory;

  @ApiPropertyOptional({ enum: Priority, default: Priority.NORMAL, description: "A client chooses Normal or High." })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional({ description: "One of the client's cases." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "caseId must be a case id." })
  @MaxLength(40, { message: "caseId is too long." })
  caseId?: string;
}

export class ReplyTicketDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @Transform(trim)
  @IsString({ message: "Write a reply first." })
  @IsNotEmpty({ message: "Write a reply first." })
  @MaxLength(5000, { message: "A reply can't be longer than 5000 characters." })
  text!: string;

  @ApiPropertyOptional({ default: false, description: "Staff only: an internal note the client never sees." })
  @IsOptional()
  @IsBoolean({ message: "internal must be true or false." })
  internal?: boolean;
}

export class ChangeTicketStatusDto {
  @ApiProperty({ enum: TicketStatus })
  @IsEnum(TicketStatus, { message: `status must be one of: ${Object.values(TicketStatus).join(", ")}.` })
  status!: TicketStatus;

  @ApiPropertyOptional({ maxLength: 1000, description: "Why the status changed. Required (as the resolution notes) when resolving." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The note must be text." })
  @MaxLength(1000, { message: "The note can't be longer than 1000 characters." })
  note?: string;

  @ApiProperty({ minimum: 1, description: "The version you loaded. A mismatch means someone else changed the ticket." })
  @Type(() => Number)
  @Min(1, { message: VERSION_MESSAGE })
  @IsInt({ message: VERSION_MESSAGE })
  version!: number;
}

export class ResolveTicketDto {
  @ApiProperty({ minLength: 1, maxLength: 1000, description: "What fixed the problem. The client sees it." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The resolution notes must be text." })
  @MaxLength(1000, { message: "The resolution notes can't be longer than 1000 characters." })
  resolutionNote?: string;

  @ApiPropertyOptional({ minimum: 1, description: "If sent, a mismatch means someone else changed the ticket." })
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: VERSION_MESSAGE })
  @IsInt({ message: VERSION_MESSAGE })
  version?: number;
}

/** Close, assign and escalate share an optional version and note. */
export class TicketActionDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: VERSION_MESSAGE })
  @IsInt({ message: VERSION_MESSAGE })
  version?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The note must be text." })
  @MaxLength(1000, { message: "The note can't be longer than 1000 characters." })
  note?: string;
}

export class AssignTicketDto extends TicketActionDto {
  @ApiPropertyOptional({ description: "The staff member to hand it to. Defaults to you; only Admin and Manager may choose someone else." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "handlerId must be a user id." })
  @MaxLength(40, { message: "handlerId is too long." })
  handlerId?: string;
}

export class EscalateTicketDto extends TicketActionDto {
  @ApiPropertyOptional({ default: true, description: "false removes an escalation." })
  @IsOptional()
  @IsBoolean({ message: "escalated must be true or false." })
  escalated?: boolean;
}

export class TicketDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ example: "TKT-1004" }) displayNumber!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: TicketCategory }) category!: TicketCategory;
  @ApiProperty({ enum: Priority }) priority!: Priority;
  @ApiProperty({ enum: TicketStatus }) status!: TicketStatus;
  @ApiProperty() statusLabel!: string;
  @ApiProperty({ description: "Optimistic-lock version: send it back with a status change." }) version!: number;
  @ApiProperty({ enum: TicketStatus, isArray: true, description: "The statuses you may move it to right now: for staff the workflow's next steps, for a client Closed (confirm) and Open (reopen) only while it is Resolved and inside the reopen window." }) allowedStatuses!: TicketStatus[];
  @ApiProperty() client!: { id: string; name: string; caseNumber: string };
  @ApiProperty({ nullable: true }) handler!: { id: string; name: string } | null;
  @ApiProperty({ nullable: true }) case!: { id: string; displayNumber: string } | null;
  @ApiPropertyOptional({ description: "Staff only." }) escalated?: boolean;
  @ApiProperty({ nullable: true, description: "The resolution notes, once resolved." }) resolution!: { note: string; by: { id: string; name: string } | null; at: Date | null } | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class TicketMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ description: "Staff only: always false for a client." }) internal!: boolean;
  @ApiProperty() author!: { id: string; name: string; role: Role };
  @ApiProperty() at!: Date;
}

export class TicketEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: TicketStatus, nullable: true }) from!: TicketStatus | null;
  @ApiProperty({ enum: TicketStatus }) to!: TicketStatus;
  @ApiProperty() note!: string;
  @ApiProperty() by!: { id: string; name: string; role: Role };
  @ApiProperty() at!: Date;
}

export class TicketDetailDto extends TicketDto {
  @ApiProperty({ type: [TicketMessageDto], description: "Internal notes are never included for a client." }) messages!: TicketMessageDto[];
  @ApiProperty({ type: [TicketEventDto], description: "A client's history leaves out events where the status didn't change (escalations, assignments)." }) events!: TicketEventDto[];
}
