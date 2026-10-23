import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsIsoDate } from "../../../common/validators/iso-date";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const toBoolean = ({ value }: { value: unknown }): unknown => (value === "true" ? true : value === "false" ? false : value);

const CATEGORY_MESSAGE = 'category must be a category name such as users, docs, cases, or "refused" for refused attempts.';

/** The filters of the audit list; the export takes the same ones. */
export class AuditFilterDto {
  @ApiPropertyOptional({ description: "Who did it (a user id)." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "actorId must be a user id." })
  @MaxLength(40, { message: "actorId is too long." })
  actorId?: string;

  @ApiPropertyOptional({ description: 'users, invites, auth, docs, cases, tickets, reports, messages, announcements, settings ... or "refused" for refused attempts.' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: CATEGORY_MESSAGE })
  @MaxLength(32, { message: CATEGORY_MESSAGE })
  @Matches(/^[a-z_]+$/, { message: CATEGORY_MESSAGE })
  category?: string;

  @ApiPropertyOptional({ description: "true: allowed actions only. false: refused attempts only." })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: "ok must be true or false." })
  ok?: boolean;

  @ApiPropertyOptional({ example: "2026-10-01", description: "From the start of this day (UTC)." })
  @IsOptional()
  @IsIsoDate({ message: "from must be a real date as YYYY-MM-DD." })
  from?: string;

  @ApiPropertyOptional({ example: "2026-10-31", description: "Up to the end of this day (UTC)." })
  @IsOptional()
  @IsIsoDate({ message: "to must be a real date as YYYY-MM-DD." })
  to?: string;

  @ApiPropertyOptional({ description: "Matches the action, the target (case ID or email) or the actor's name." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;
}

export class ListAuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "actorId must be a user id." })
  @MaxLength(40, { message: "actorId is too long." })
  actorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: CATEGORY_MESSAGE })
  @MaxLength(32, { message: CATEGORY_MESSAGE })
  @Matches(/^[a-z_]+$/, { message: CATEGORY_MESSAGE })
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: "ok must be true or false." })
  ok?: boolean;

  @ApiPropertyOptional({ example: "2026-10-01" })
  @IsOptional()
  @IsIsoDate({ message: "from must be a real date as YYYY-MM-DD." })
  from?: string;

  @ApiPropertyOptional({ example: "2026-10-31" })
  @IsOptional()
  @IsIsoDate({ message: "to must be a real date as YYYY-MM-DD." })
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;
}

export class AuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() at!: Date;
  @ApiProperty({ nullable: true }) actor!: { id: string; name: string } | null;
  @ApiProperty({ enum: Role, nullable: true }) actorRole!: Role | null;
  @ApiProperty() action!: string;
  @ApiProperty() target!: string;
  @ApiProperty({ description: "False for a refused attempt." }) ok!: boolean;
  @ApiProperty() category!: string;
  @ApiProperty({ nullable: true }) requestId!: string | null;
  @ApiProperty({ nullable: true }) ipAddress!: string | null;
}
