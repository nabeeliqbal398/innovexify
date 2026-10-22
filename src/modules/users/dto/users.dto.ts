import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NotificationCategory, Role, UserStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const lower = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim().toLowerCase() : value);

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Matches name or email." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role, { message: `role must be one of: ${Object.values(Role).join(", ")}.` })
  role?: Role;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus, { message: `status must be one of: ${Object.values(UserStatus).join(", ")}.` })
  status?: UserStatus;
}

export class InviteUserDto {
  @ApiPropertyOptional({ description: "Defaults to the part of the email before the @." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Enter the person's name." })
  @MaxLength(120, { message: "The name can't be longer than 120 characters." })
  name?: string;

  @ApiProperty({ example: "new.csr@example.com" })
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254, { message: "That email address is too long." })
  email!: string;

  @ApiProperty({ enum: ["MANAGER", "CSR", "COMPLIANCE"], description: "Clients are invited with POST /clients so their case is created with them." })
  @IsEnum(Role, { message: `role must be one of: ${Object.values(Role).join(", ")}.` })
  role!: Role;

  @ApiPropertyOptional({ description: "A personal message included in the invitation email." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The note must be text." })
  @MaxLength(500, { message: "The note can't be longer than 500 characters." })
  note?: string;
}

export class UpdateUserNameDto {
  @ApiProperty()
  @Transform(trim)
  @IsString({ message: "Enter the full name." })
  @IsNotEmpty({ message: "Enter the full name." })
  @MaxLength(120, { message: "The name can't be longer than 120 characters." })
  name!: string;
}

export class UpdateUserEmailDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254, { message: "That email address is too long." })
  email!: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ["ACTIVE", "SUSPENDED"], description: "SUSPENDED to suspend, ACTIVE to reactivate." })
  @IsIn(["ACTIVE", "SUSPENDED"], { message: "status must be SUSPENDED (to suspend) or ACTIVE (to reactivate)." })
  status!: "ACTIVE" | "SUSPENDED";

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The reason must be text." })
  @MaxLength(300, { message: "The reason can't be longer than 300 characters." })
  reason?: string;
}

export class NotificationPreferenceItemDto {
  @ApiProperty({ enum: NotificationCategory })
  @IsEnum(NotificationCategory, { message: `category must be one of: ${Object.values(NotificationCategory).join(", ")}.` })
  category!: NotificationCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: "email must be true or false." })
  email?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: "inApp must be true or false." })
  inApp?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceItemDto], description: "Only the categories you list change." })
  @IsArray({ message: "preferences must be a list." })
  @ArrayMinSize(1, { message: "Send at least one category to change." })
  @ArrayMaxSize(Object.values(NotificationCategory).length, { message: "Each category can appear once." })
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];
}

export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ nullable: true }) invitedById!: string | null;
  @ApiProperty({ nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty({ nullable: true, description: "Clients only: their case ID, such as CASE-2026-0042." }) caseNumber!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class NotificationPreferenceDto {
  @ApiProperty({ enum: NotificationCategory }) category!: NotificationCategory;
  @ApiProperty() email!: boolean;
  @ApiProperty() inApp!: boolean;
}
