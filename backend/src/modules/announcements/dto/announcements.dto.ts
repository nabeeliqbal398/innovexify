import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AnnouncementPriority, AnnouncementStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsIsoDate } from "../../../common/validators/iso-date";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

export class ListAnnouncementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AnnouncementStatus, description: "Staff only. A client only ever gets published announcements." })
  @IsOptional()
  @IsEnum(AnnouncementStatus, { message: `status must be one of: ${Object.values(AnnouncementStatus).join(", ")}.` })
  status?: AnnouncementStatus;

  @ApiPropertyOptional({ description: 'Staff only. "all" for announcements to every client, or one client\'s id.' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "audience must be all, or a client id." })
  @MaxLength(40, { message: "audience is too long." })
  audience?: string;

  @ApiPropertyOptional({ enum: AnnouncementPriority })
  @IsOptional()
  @IsEnum(AnnouncementPriority, { message: `priority must be one of: ${Object.values(AnnouncementPriority).join(", ")}.` })
  priority?: AnnouncementPriority;
}

export class CreateAnnouncementDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString({ message: "Add a title." })
  @IsNotEmpty({ message: "Add a title." })
  @MaxLength(200, { message: "The title can't be longer than 200 characters." })
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @Transform(trim)
  @IsString({ message: "Add a message." })
  @IsNotEmpty({ message: "Add a message." })
  @MaxLength(5000, { message: "The message can't be longer than 5000 characters." })
  message!: string;

  @ApiPropertyOptional({ default: "all", description: '"all" for every client, or the id of one active client.' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "audience must be all, or a client id." })
  @MaxLength(40, { message: "audience is too long." })
  audience?: string;

  @ApiPropertyOptional({ enum: AnnouncementPriority, default: AnnouncementPriority.NORMAL })
  @IsOptional()
  @IsEnum(AnnouncementPriority, { message: `priority must be one of: ${Object.values(AnnouncementPriority).join(", ")}.` })
  priority?: AnnouncementPriority;

  @ApiPropertyOptional({ example: "2026-12-31", description: "Today or later, by the server's date. Empty means no expiry." })
  @IsOptional()
  @IsIsoDate({ message: "Enter a real expiry date as YYYY-MM-DD." })
  expiresAt?: string;

  @ApiPropertyOptional({ default: false, description: "Ask clients to acknowledge it." })
  @IsOptional()
  @IsBoolean({ message: "requireAck must be true or false." })
  requireAck?: boolean;

  @ApiPropertyOptional({ default: false, description: "true publishes at once; false saves a draft." })
  @IsOptional()
  @IsBoolean({ message: "publish must be true or false." })
  publish?: boolean;
}

export class UpdateAnnouncementDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Add a title." })
  @IsNotEmpty({ message: "Add a title." })
  @MaxLength(200, { message: "The title can't be longer than 200 characters." })
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Add a message." })
  @IsNotEmpty({ message: "Add a message." })
  @MaxLength(5000, { message: "The message can't be longer than 5000 characters." })
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "audience must be all, or a client id." })
  @MaxLength(40, { message: "audience is too long." })
  audience?: string;

  @ApiPropertyOptional({ enum: AnnouncementPriority })
  @IsOptional()
  @IsEnum(AnnouncementPriority, { message: `priority must be one of: ${Object.values(AnnouncementPriority).join(", ")}.` })
  priority?: AnnouncementPriority;

  @ApiPropertyOptional({ nullable: true, description: "null clears the expiry." })
  @IsOptional()
  @IsIsoDate({ message: "Enter a real expiry date as YYYY-MM-DD." })
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: "requireAck must be true or false." })
  requireAck?: boolean;
}

/** One shape; a client receives only the first block of fields. */
export class AnnouncementDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: AnnouncementPriority }) priority!: AnnouncementPriority;
  @ApiProperty({ nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ nullable: true, example: "2026-12-31" }) expiresAt!: string | null;
  @ApiProperty() requireAck!: boolean;
  @ApiPropertyOptional({ description: "Clients only: whether you have acknowledged it." }) acknowledged?: boolean;
  @ApiPropertyOptional({ nullable: true, description: "Clients only." }) acknowledgedAt?: Date | null;
  @ApiPropertyOptional({ enum: AnnouncementStatus, description: "Staff only." }) status?: AnnouncementStatus;
  @ApiPropertyOptional({ description: "Staff only: who it is for." }) audience?: { type: "all" } | { type: "client"; id: string; name: string };
  @ApiPropertyOptional({ description: "Staff only." }) createdBy?: { id: string; name: string };
  @ApiPropertyOptional({ description: "Staff only." }) createdAt?: Date;
  @ApiPropertyOptional({ nullable: true, description: "Staff only, when acknowledgement is required: 3/5 acknowledged." }) acks?: { acknowledged: number; total: number } | null;
}

export class AckListDto {
  @ApiProperty() announcementId!: string;
  @ApiProperty() acknowledged!: number;
  @ApiProperty() total!: number;
  @ApiProperty() clients!: Array<{ id: string; name: string; caseNumber: string; acknowledged: boolean; at: Date | null }>;
}
