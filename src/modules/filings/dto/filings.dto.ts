import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FilingStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsIsoDate } from "../../../common/validators/iso-date";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const STATUS_MESSAGE = `status must be one of: ${Object.values(FilingStatus).join(", ")}.`;

export const ILLUSTRATIVE_NOTE = "Illustrative reminder: confirm the real date with the state. It is not a legal deadline.";

export class ListFilingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FilingStatus })
  @IsOptional()
  @IsEnum(FilingStatus, { message: STATUS_MESSAGE })
  status?: FilingStatus;

  @ApiPropertyOptional({ example: "2026-11-01", description: "Next action on or after this day." })
  @IsOptional()
  @IsIsoDate({ message: "nextActionFrom must be a real date as YYYY-MM-DD." })
  nextActionFrom?: string;

  @ApiPropertyOptional({ example: "2026-11-30", description: "Next action on or before this day." })
  @IsOptional()
  @IsIsoDate({ message: "nextActionTo must be a real date as YYYY-MM-DD." })
  nextActionTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "caseId must be a case id." })
  @MaxLength(40, { message: "caseId is too long." })
  caseId?: string;

  @ApiPropertyOptional({ description: "Matches the filing type, reference, client name, or a number like FIL-9 / PRJ-118." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;
}

export class CreateFilingDto {
  @ApiProperty({ description: "The case this filing belongs to." })
  @Transform(trim)
  @IsString({ message: "Choose the case this filing belongs to." })
  @IsNotEmpty({ message: "Choose the case this filing belongs to." })
  @MaxLength(40, { message: "caseId is too long." })
  caseId!: string;

  @ApiProperty({ maxLength: 120, example: "Articles of Organization" })
  @Transform(trim)
  @IsString({ message: "Enter the filing type." })
  @IsNotEmpty({ message: "Enter the filing type." })
  @MaxLength(120, { message: "The filing type can't be longer than 120 characters." })
  type!: string;

  @ApiPropertyOptional({ enum: FilingStatus, default: FilingStatus.NOT_SUBMITTED })
  @IsOptional()
  @IsEnum(FilingStatus, { message: STATUS_MESSAGE })
  status?: FilingStatus;

  @ApiPropertyOptional({ example: "2026-10-20", description: "The day it was submitted. Required once the status is past Not submitted; never in the future." })
  @IsOptional()
  @IsIsoDate({ message: "Enter the submission date as YYYY-MM-DD." })
  submittedOn?: string;

  @ApiPropertyOptional({ maxLength: 64, description: "The state's reference number. Required when Approved." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The reference must be text." })
  @MaxLength(64, { message: "The reference can't be longer than 64 characters." })
  reference?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The next action must be text." })
  @MaxLength(200, { message: "The next action can't be longer than 200 characters." })
  nextAction?: string;

  @ApiPropertyOptional({ example: "2026-11-15" })
  @IsOptional()
  @IsIsoDate({ message: "Enter the next action date as YYYY-MM-DD." })
  nextActionDate?: string;
}

export class UpdateFilingDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter the filing type." })
  @IsNotEmpty({ message: "Enter the filing type." })
  @MaxLength(120, { message: "The filing type can't be longer than 120 characters." })
  type?: string;

  @ApiPropertyOptional({ enum: FilingStatus, description: "Moves forward only, unless Admin or Manager give a reason." })
  @IsOptional()
  @IsEnum(FilingStatus, { message: STATUS_MESSAGE })
  status?: FilingStatus;

  @ApiPropertyOptional({ nullable: true, description: "null clears it." })
  @IsOptional()
  @IsIsoDate({ message: "Enter the submission date as YYYY-MM-DD." })
  submittedOn?: string | null;

  @ApiPropertyOptional({ maxLength: 64, description: "An empty string clears it." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The reference must be text." })
  @MaxLength(64, { message: "The reference can't be longer than 64 characters." })
  reference?: string;

  @ApiPropertyOptional({ maxLength: 200, description: "An empty string clears it." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The next action must be text." })
  @MaxLength(200, { message: "The next action can't be longer than 200 characters." })
  nextAction?: string;

  @ApiPropertyOptional({ nullable: true, description: "null clears it." })
  @IsOptional()
  @IsIsoDate({ message: "Enter the next action date as YYYY-MM-DD." })
  nextActionDate?: string | null;

  @ApiPropertyOptional({ maxLength: 40, description: "A short note on the outcome. Approved and Rejected set it themselves." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The outcome must be text." })
  @MaxLength(40, { message: "The outcome can't be longer than 40 characters." })
  outcome?: string;

  @ApiPropertyOptional({ maxLength: 300, description: "Why a filing is being moved back. Required for that, Admin and Manager only." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The reason must be text." })
  @MaxLength(300, { message: "The reason can't be longer than 300 characters." })
  reason?: string;
}

export class CreateReminderDto {
  @ApiProperty({ maxLength: 200, example: "Delaware annual report" })
  @Transform(trim)
  @IsString({ message: "Enter a reminder title." })
  @IsNotEmpty({ message: "Enter a reminder title." })
  @MaxLength(200, { message: "The title can't be longer than 200 characters." })
  title!: string;

  @ApiProperty({ example: "2027-03-01" })
  @IsIsoDate({ message: "Enter the reminder date as YYYY-MM-DD." })
  date!: string;

  @ApiProperty({ maxLength: 40, example: "annual" })
  @Transform(trim)
  @IsString({ message: "Enter what kind of reminder this is." })
  @IsNotEmpty({ message: "Enter what kind of reminder this is." })
  @MaxLength(40, { message: "The kind can't be longer than 40 characters." })
  kind!: string;
}

export class ListRemindersQueryDto extends PaginationQueryDto {}

export class FilingDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ example: "FIL-9" }) displayNumber!: string;
  @ApiProperty() case!: { id: string; displayNumber: string; client: { id: string; name: string } };
  @ApiProperty() type!: string;
  @ApiProperty({ enum: FilingStatus }) status!: FilingStatus;
  @ApiProperty({ nullable: true }) submittedOn!: string | null;
  @ApiProperty() reference!: string;
  @ApiProperty() nextAction!: string;
  @ApiProperty({ nullable: true }) nextActionDate!: string | null;
  @ApiProperty() outcome!: string;
  @ApiProperty({ description: "The next action date has passed and the filing isn't approved." }) late!: boolean;
  @ApiProperty() updatedAt!: Date;
}

export class ReminderDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ example: "2027-03-01" }) date!: string;
  @ApiProperty() kind!: string;
  @ApiProperty({ description: "Always true. A reminder is an internal working date, never a legal deadline." }) illustrative!: true;
  @ApiProperty({ description: "The wording to show next to it." }) note!: string;
}
