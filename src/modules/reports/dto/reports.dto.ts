import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Priority, ReportCategory, ReportStatus, Role } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

export class ListReportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus, { message: `status must be one of: ${Object.values(ReportStatus).join(", ")}.` })
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional({ enum: ReportCategory })
  @IsOptional()
  @IsEnum(ReportCategory, { message: `category must be one of: ${Object.values(ReportCategory).join(", ")}.` })
  category?: ReportCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "clientId must be a client id." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId?: string;

  @ApiPropertyOptional({ description: "A CSR's id. A CSR only ever sees their own, whatever they ask for." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "csrId must be a user id." })
  @MaxLength(40, { message: "csrId is too long." })
  csrId?: string;

  @ApiPropertyOptional({ description: "Matches the title, the client's name, or a number like RPT-201." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;
}

export class CreateReportDto {
  @ApiProperty({ description: "One of your own clients." })
  @Transform(trim)
  @IsString({ message: "Select one of your clients." })
  @IsNotEmpty({ message: "Select one of your clients." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString({ message: "Enter a title." })
  @IsNotEmpty({ message: "Enter a title." })
  @MaxLength(200, { message: "The title can't be longer than 200 characters." })
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @Transform(trim)
  @IsString({ message: "Describe what Compliance should know." })
  @IsNotEmpty({ message: "Describe what Compliance should know." })
  @MaxLength(5000, { message: "The report can't be longer than 5000 characters." })
  body!: string;

  @ApiPropertyOptional({ enum: ReportCategory, default: ReportCategory.OTHER })
  @IsOptional()
  @IsEnum(ReportCategory, { message: `category must be one of: ${Object.values(ReportCategory).join(", ")}.` })
  category?: ReportCategory;

  @ApiPropertyOptional({ enum: Priority, default: Priority.NORMAL })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional({ maxLength: 500, description: "What you would like Compliance to do." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The requested action must be text." })
  @MaxLength(500, { message: "The requested action can't be longer than 500 characters." })
  action?: string;

  @ApiPropertyOptional({ description: "One of this client's cases. Defaults to their current case." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "caseId must be a case id." })
  @MaxLength(40, { message: "caseId is too long." })
  caseId?: string;
}

export class ReportTextDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @Transform(trim)
  @IsString({ message: "Write something first." })
  @IsNotEmpty({ message: "Write something first." })
  @MaxLength(5000, { message: "That can't be longer than 5000 characters." })
  text!: string;
}

export class SetReportStatusDto {
  @ApiProperty({ enum: ["ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "REVIEWED"], description: "REVIEWED is shown to people as Resolved." })
  @IsIn(["ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "REVIEWED"], { message: "status must be ACKNOWLEDGED, CLARIFICATION_REQUESTED or REVIEWED." })
  status!: "ACKNOWLEDGED" | "CLARIFICATION_REQUESTED" | "REVIEWED";
}

export class ReportDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ example: "RPT-201" }) displayNumber!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: ReportCategory }) category!: ReportCategory;
  @ApiProperty({ enum: Priority }) priority!: Priority;
  @ApiProperty() action!: string;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
  @ApiProperty({ description: 'What to show: "Resolved" for REVIEWED.' }) statusLabel!: string;
  @ApiProperty() client!: { id: string; name: string; caseNumber: string };
  @ApiProperty() csr!: { id: string; name: string };
  @ApiProperty({ nullable: true }) case!: { id: string; displayNumber: string } | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ReportMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ description: "True for a Compliance-only note. CSRs never receive these." }) isNote!: boolean;
  @ApiProperty() author!: { id: string; name: string; role: Role };
  @ApiProperty() at!: Date;
}

export class ReportEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
  @ApiProperty() statusLabel!: string;
  @ApiProperty() by!: { id: string; name: string };
  @ApiProperty() at!: Date;
}

export class ReportDetailDto extends ReportDto {
  @ApiProperty({ type: [ReportMessageDto] }) messages!: ReportMessageDto[];
  @ApiProperty({ type: [ReportEventDto] }) events!: ReportEventDto[];
}
