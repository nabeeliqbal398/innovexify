import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FollowUpStatus, InteractionType } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsIsoDate } from "../../../common/validators/iso-date";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

const TYPE_MESSAGE = `type must be one of: ${Object.values(InteractionType).join(", ")}.`;
export const FOLLOWUP_FILTERS = ["overdue", "today", "upcoming"] as const;
export type FollowUpFilter = (typeof FOLLOWUP_FILTERS)[number];

export class ListFollowUpsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "A CSR's id. A CSR only ever sees their own, whatever they ask for." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "csrId must be a user id." })
  @MaxLength(40, { message: "csrId is too long." })
  csrId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "clientId must be a client id." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId?: string;

  @ApiPropertyOptional({ enum: FollowUpStatus })
  @IsOptional()
  @IsEnum(FollowUpStatus, { message: `status must be one of: ${Object.values(FollowUpStatus).join(", ")}.` })
  status?: FollowUpStatus;

  @ApiPropertyOptional({ enum: FOLLOWUP_FILTERS, description: "Open follow-ups only: overdue (before today), today, upcoming (after today)." })
  @IsOptional()
  @IsIn(FOLLOWUP_FILTERS, { message: `filter must be one of: ${FOLLOWUP_FILTERS.join(", ")}.` })
  filter?: FollowUpFilter;
}

export class CreateFollowUpDto {
  @ApiProperty({ description: "The client. A CSR can only pick one of their own." })
  @Transform(trim)
  @IsString({ message: "Choose a client." })
  @IsNotEmpty({ message: "Choose a client." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId!: string;

  @ApiProperty({ enum: InteractionType })
  @IsEnum(InteractionType, { message: TYPE_MESSAGE })
  type!: InteractionType;

  @ApiProperty({ example: "2026-11-05", description: "Today or later." })
  @IsIsoDate({ message: "Choose a due date (YYYY-MM-DD)." })
  due!: string;

  @ApiProperty({ maxLength: 500, description: "What the follow-up is about." })
  @Transform(trim)
  @IsString({ message: "Add what the follow-up is about." })
  @IsNotEmpty({ message: "Add what the follow-up is about." })
  @MaxLength(500, { message: "The note can't be longer than 500 characters." })
  note!: string;
}

export class UpdateFollowUpDto {
  @ApiPropertyOptional({ enum: InteractionType })
  @IsOptional()
  @IsEnum(InteractionType, { message: TYPE_MESSAGE })
  type?: InteractionType;

  @ApiPropertyOptional({ example: "2026-11-05", description: "Changing it needs today or a later date." })
  @IsOptional()
  @IsIsoDate({ message: "Choose a due date (YYYY-MM-DD)." })
  due?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Add what the follow-up is about." })
  @IsNotEmpty({ message: "Add what the follow-up is about." })
  @MaxLength(500, { message: "The note can't be longer than 500 characters." })
  note?: string;
}

export class CompleteFollowUpDto {
  /** Required, but checked in the service so a missing outcome gets its own error code. */
  @ApiProperty({ minLength: 1, maxLength: 2000, description: "What happened. It is also written to the client's timeline." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The outcome must be text." })
  @MaxLength(2000, { message: "The outcome can't be longer than 2000 characters." })
  outcome?: string;
}

export class CreateInteractionDto {
  @ApiProperty({ enum: InteractionType })
  @IsEnum(InteractionType, { message: `kind must be one of: ${Object.values(InteractionType).join(", ")}.` })
  kind!: InteractionType;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString({ message: "Summarize the interaction." })
  @IsNotEmpty({ message: "Summarize the interaction." })
  @MaxLength(2000, { message: "The summary can't be longer than 2000 characters." })
  text!: string;
}

export class ListInteractionsQueryDto extends PaginationQueryDto {}

export class ListRecentInteractionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Only this client's." })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString({ message: "clientId must be a client id." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId?: string;
}

export class FollowUpDto {
  @ApiProperty() id!: string;
  @ApiProperty() client!: { id: string; name: string; caseNumber: string };
  @ApiProperty() csr!: { id: string; name: string };
  @ApiProperty({ enum: InteractionType }) type!: InteractionType;
  @ApiProperty({ example: "2026-11-05" }) due!: string;
  @ApiProperty({ enum: FollowUpStatus }) status!: FollowUpStatus;
  @ApiProperty() note!: string;
  @ApiProperty() outcome!: string;
  @ApiProperty({ nullable: true }) doneAt!: Date | null;
  @ApiProperty({ description: "Open and due before today, by the server's date." }) overdue!: boolean;
  @ApiProperty() createdAt!: Date;
}

export class InteractionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: InteractionType }) kind!: InteractionType;
  @ApiProperty() text!: string;
  @ApiProperty() by!: { id: string; name: string };
  @ApiProperty() at!: Date;
}

export class RecentInteractionDto extends InteractionDto {
  @ApiProperty() client!: { id: string; name: string; caseNumber: string };
}
