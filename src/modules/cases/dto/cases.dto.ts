import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CaseStage, CaseStatus, NoteVisibility, Priority } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from "class-validator";

import { FORMATION_STATES, LIMITS } from "../../../common/constants/formation";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsIsoDate } from "../../../common/validators/iso-date";
import { EDITABLE_STATUSES } from "../interfaces/case-rules";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

const VERSION_MESSAGE = "Send the version you loaded (version), so we can tell if someone else changed the case since.";

export class ListCasesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Matches client name, email, business name, case ID, service, or a number like PRJ-118." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;

  @ApiPropertyOptional({ enum: CaseStage })
  @IsOptional()
  @IsEnum(CaseStage, { message: `stage must be one of: ${Object.values(CaseStage).join(", ")}.` })
  stage?: CaseStage;

  @ApiPropertyOptional({ enum: CaseStatus })
  @IsOptional()
  @IsEnum(CaseStatus, { message: `status must be one of: ${Object.values(CaseStatus).join(", ")}.` })
  status?: CaseStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional({ description: 'A Compliance user id, or "none" for cases without an owner.' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "ownerId must be a user id, or none." })
  @MaxLength(40, { message: "ownerId is too long." })
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "clientId must be a client id." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "serviceId must be a service id." })
  @MaxLength(32, { message: "serviceId is too long." })
  serviceId?: string;

  @ApiPropertyOptional({ example: "2026-11-01", description: "Target date on or after this day." })
  @IsOptional()
  @IsIsoDate({ message: "deadlineFrom must be a real date as YYYY-MM-DD." })
  deadlineFrom?: string;

  @ApiPropertyOptional({ example: "2026-11-30", description: "Target date on or before this day." })
  @IsOptional()
  @IsIsoDate({ message: "deadlineTo must be a real date as YYYY-MM-DD." })
  deadlineTo?: string;

  @ApiPropertyOptional({ description: 'The client\'s CSR id, or "none" for clients without a CSR.' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "csrId must be a CSR id, or none." })
  @MaxLength(40, { message: "csrId is too long." })
  csrId?: string;

  @ApiPropertyOptional({ description: "The client's formation state." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "state must be a state name." })
  @MaxLength(40, { message: "state is too long." })
  state?: string;

  @ApiPropertyOptional({ description: "true: only cases that are not finished and whose target date has passed (by the server's date)." })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === "true" ? true : value === "false" ? false : value))
  @IsBoolean({ message: "overdue must be true or false." })
  overdue?: boolean;

  @ApiPropertyOptional({ example: "2026-09-01", description: "Opened on or after this day." })
  @IsOptional()
  @IsIsoDate({ message: "openedFrom must be a real date as YYYY-MM-DD." })
  openedFrom?: string;
}

export class CreateCaseDto {
  @ApiProperty({ description: "The client's id." })
  @Transform(trim)
  @IsString({ message: "Choose a client." })
  @IsNotEmpty({ message: "Choose a client." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId!: string;

  @ApiProperty({ example: "llc" })
  @Transform(trim)
  @IsString({ message: "Choose a service." })
  @IsNotEmpty({ message: "Choose a service." })
  @MaxLength(32, { message: "serviceId is too long." })
  serviceId!: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.NORMAL })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiProperty({ example: "2026-12-31" })
  @IsIsoDate({ message: "Choose a target date (YYYY-MM-DD)." })
  deadline!: string;

  @ApiPropertyOptional({ description: "Updates the client's business name when sent." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter the business name." })
  @MaxLength(LIMITS.businessName, { message: `The business name can't be longer than ${LIMITS.businessName} characters.` })
  businessName?: string;

  @ApiPropertyOptional({ enum: FORMATION_STATES, description: "Updates the client's formation state when sent." })
  @IsOptional()
  @Transform(trim)
  @IsIn(FORMATION_STATES, { message: `Choose a formation state: ${FORMATION_STATES.join(", ")}.` })
  formationState?: string;
}

export class UpdateCaseDto {
  @ApiProperty({ minimum: 1, description: "The version you loaded. A mismatch means someone else changed the case." })
  @Type(() => Number)
  @IsInt({ message: VERSION_MESSAGE })
  @Min(1, { message: VERSION_MESSAGE })
  version!: number;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional({ nullable: true, example: "2026-12-31", description: "null clears the target date." })
  @IsOptional()
  @IsIsoDate({ message: "Enter a real target date as YYYY-MM-DD, or null to clear it." })
  deadline?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "An active Compliance user's id; null clears the owner." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "ownerId must be a user id, or null to clear it." })
  @MaxLength(40, { message: "ownerId is too long." })
  ownerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "serviceId must be a service id." })
  @MaxLength(32, { message: "serviceId is too long." })
  serviceId?: string;

  @ApiPropertyOptional({ enum: EDITABLE_STATUSES, description: "Completed is reached by moving the stage, not by editing." })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES, { message: `status can be set to ${EDITABLE_STATUSES.join(", ")}. A case becomes COMPLETED by moving it to the Completed stage.` })
  status?: CaseStatus;
}

export class MoveStageDto {
  @ApiProperty({ enum: CaseStage })
  @IsEnum(CaseStage, { message: `Choose a stage: ${Object.values(CaseStage).join(", ")}.` })
  targetStage!: CaseStage;

  @ApiProperty({ minimum: 1, description: "The version you loaded. A mismatch means someone else changed the case." })
  @Type(() => Number)
  @IsInt({ message: VERSION_MESSAGE })
  @Min(1, { message: VERSION_MESSAGE })
  version!: number;

  @ApiPropertyOptional({ description: "The state's confirmation number. Required when moving past State Approval Received unless one is on file." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter the state's confirmation number." })
  @MaxLength(64, { message: "The confirmation number can't be longer than 64 characters." })
  filingConfirmation?: string;

  @ApiPropertyOptional({ description: "A note for the timeline. Required, as the reason, when moving a case back." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The note must be text." })
  @MaxLength(400, { message: "The note can't be longer than 400 characters." })
  note?: string;
}

export class AddNoteDto {
  @ApiProperty({ maxLength: 5000 })
  @Transform(trim)
  @IsString({ message: "Write a note first." })
  @IsNotEmpty({ message: "Write a note first." })
  @MaxLength(5000, { message: "A note can't be longer than 5000 characters." })
  text!: string;

  @ApiPropertyOptional({ enum: NoteVisibility, default: NoteVisibility.STAFF, description: "STAFF: every staff member. COMPLIANCE: Admin, Manager and Compliance only." })
  @IsOptional()
  @IsEnum(NoteVisibility, { message: `visibility must be one of: ${Object.values(NoteVisibility).join(", ")}.` })
  visibility?: NoteVisibility;
}

export class EventsQueryDto extends PaginationQueryDto {}

export class PersonRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class CaseDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ example: "PRJ-118" }) displayNumber!: string;
  @ApiProperty({ description: "Optimistic-lock version. Send it back when you change the case." }) version!: number;
  @ApiProperty({ enum: CaseStage }) stage!: CaseStage;
  @ApiProperty({ enum: CaseStatus }) status!: CaseStatus;
  @ApiProperty({ enum: Priority }) priority!: Priority;
  @ApiProperty({ nullable: true, example: "2026-12-31" }) deadline!: string | null;
  @ApiProperty() filingConfirmation!: string;
  @ApiProperty() service!: { id: string; name: string };
  @ApiProperty() client!: { id: string; name: string; email: string; caseNumber: string; businessName: string; formationState: string; csr: { id: string; name: string } | null };
  @ApiProperty({ nullable: true, type: PersonRefDto }) owner!: PersonRefDto | null;
  @ApiProperty({ nullable: true }) completedAt!: Date | null;
  @ApiProperty() lastActivityAt!: Date;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ nullable: true, description: "Set when the case was removed with its client (Admin and Manager only see these)." }) deletedAt!: Date | null;
}

export class CaseEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CaseStage, nullable: true }) toStage!: CaseStage | null;
  @ApiProperty({ nullable: true, description: "Staff only." }) note?: string;
  @ApiProperty({ nullable: true, type: PersonRefDto, description: "Staff only." }) by?: PersonRefDto;
  @ApiProperty() at!: Date;
}

export class CaseNoteDto {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiProperty({ enum: NoteVisibility }) visibility!: NoteVisibility;
  @ApiProperty() text!: string;
  @ApiProperty({ type: PersonRefDto }) author!: PersonRefDto;
  @ApiProperty() createdAt!: Date;
}

export class CaseDetailDto extends CaseDto {
  @ApiProperty({ type: [CaseEventDto] }) events!: CaseEventDto[];
  @ApiProperty({ type: [CaseNoteDto], description: "Only the notes the caller may see. A client never gets any." }) notes!: CaseNoteDto[];
  @ApiProperty({ nullable: true, description: "Filing tracker rows. Null for roles that can't open the tracker." }) filings!: Array<{
    id: string;
    number: number;
    displayNumber: string;
    type: string;
    status: string;
    submittedOn: string | null;
    reference: string;
    nextAction: string;
    nextActionDate: string | null;
  }> | null;
  @ApiProperty() tasks!: { total: number; open: number; overdue: number };
}
