import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Priority, TaskType, TaskVisibility } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsIsoDate } from "../../../common/validators/iso-date";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const toBoolean = ({ value }: { value: unknown }): unknown => (value === "true" ? true : value === "false" ? false : value);

export const TASK_FILTERS = ["overdue", "today", "week", "mine"] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

export class ListTasksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "caseId must be a case id." })
  @MaxLength(40, { message: "caseId is too long." })
  caseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "assigneeId must be a user id." })
  @MaxLength(40, { message: "assigneeId is too long." })
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TaskType })
  @IsOptional()
  @IsEnum(TaskType, { message: `type must be one of: ${Object.values(TaskType).join(", ")}.` })
  type?: TaskType;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional({ description: "true: completed tasks only. false: open tasks only." })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: "done must be true or false." })
  done?: boolean;

  @ApiPropertyOptional({ enum: TASK_FILTERS, description: "overdue: open and past due. today: open, due today. week: open, due in the next 7 days. mine: assigned to me." })
  @IsOptional()
  @IsIn(TASK_FILTERS, { message: `filter must be one of: ${TASK_FILTERS.join(", ")}.` })
  filter?: TaskFilter;

  @ApiPropertyOptional({ description: "Matches the title, the client's name, or a case number like PRJ-118." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;
}

export class CreateTaskDto {
  @ApiProperty({ description: "The case the task belongs to." })
  @Transform(trim)
  @IsString({ message: "Link the task to a case." })
  @IsNotEmpty({ message: "Link the task to a case." })
  @MaxLength(40, { message: "caseId is too long." })
  caseId!: string;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString({ message: "Enter a task title." })
  @IsNotEmpty({ message: "Enter a task title." })
  @MaxLength(200, { message: "The title can't be longer than 200 characters." })
  title!: string;

  @ApiPropertyOptional({ description: "Defaults to you. Admin and Manager may choose any active staff member; others only themselves." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "assigneeId must be a user id." })
  @MaxLength(40, { message: "assigneeId is too long." })
  assigneeId?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.NORMAL })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional({ example: "2026-11-30", description: "Required for Admin and Manager. CSR and Compliance default to three days from now." })
  @IsOptional()
  @IsIsoDate({ message: "Enter a real due date as YYYY-MM-DD." })
  due?: string;

  @ApiPropertyOptional({ enum: TaskVisibility, default: TaskVisibility.INTERNAL, description: "CLIENT tasks are the only tasks a client can see." })
  @IsOptional()
  @IsEnum(TaskVisibility, { message: `visibility must be one of: ${Object.values(TaskVisibility).join(", ")}.` })
  visibility?: TaskVisibility;
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter a task title." })
  @IsNotEmpty({ message: "Enter a task title." })
  @MaxLength(200, { message: "The title can't be longer than 200 characters." })
  title?: string;

  @ApiPropertyOptional({ example: "2026-11-30" })
  @IsOptional()
  @IsIsoDate({ message: "Enter a real due date as YYYY-MM-DD." })
  due?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority, { message: `priority must be one of: ${Object.values(Priority).join(", ")}.` })
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "assigneeId must be a user id." })
  @MaxLength(40, { message: "assigneeId is too long." })
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TaskVisibility })
  @IsOptional()
  @IsEnum(TaskVisibility, { message: `visibility must be one of: ${Object.values(TaskVisibility).join(", ")}.` })
  visibility?: TaskVisibility;
}

export class PersonRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class TaskDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: TaskType }) type!: TaskType;
  @ApiProperty({ enum: TaskVisibility }) visibility!: TaskVisibility;
  @ApiProperty({ enum: Priority }) priority!: Priority;
  @ApiProperty({ example: "2026-11-30" }) due!: string;
  @ApiProperty() done!: boolean;
  @ApiProperty({ description: "Computed on the server from the server's date: open and due before today." }) overdue!: boolean;
  @ApiProperty() case!: { id: string; number: number; displayNumber: string; client: { id: string; name: string } };
  @ApiProperty({ type: PersonRefDto }) assignee!: PersonRefDto;
  @ApiProperty({ type: PersonRefDto }) createdBy!: PersonRefDto;
  @ApiProperty({ nullable: true, type: PersonRefDto }) completedBy!: PersonRefDto | null;
  @ApiProperty({ nullable: true }) completedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
