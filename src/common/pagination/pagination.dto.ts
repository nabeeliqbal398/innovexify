import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/**
 * Query string shared by every list endpoint. Out-of-range values are rejected with a message naming the field;
 * they are never silently clamped, so a client that asks for limit=500 learns it gets at most 100.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  // Decorators run bottom-up and the first failure is the one reported, so IsInt goes last: "abc" is "not a number", not "too small".
  @Min(1, { message: "page must be 1 or greater." })
  @IsInt({ message: "page must be a whole number, 1 or greater." })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT })
  @Type(() => Number)
  @Max(MAX_PAGE_LIMIT, { message: `limit can't be more than ${MAX_PAGE_LIMIT}. Ask for a smaller page.` })
  @Min(1, { message: "limit must be 1 or greater." })
  @IsInt({ message: `limit must be a whole number from 1 to ${MAX_PAGE_LIMIT}.` })
  limit: number = DEFAULT_PAGE_LIMIT;

  @ApiPropertyOptional({ description: "Field to sort by. Which fields are allowed depends on the endpoint." })
  @IsOptional()
  @IsString({ message: "sort must be a field name." })
  @MaxLength(40, { message: "sort is too long." })
  @Matches(/^[A-Za-z][A-Za-z0-9]*$/, { message: "sort must be a field name." })
  sort?: string;

  @ApiPropertyOptional({ enum: ["asc", "desc"] })
  @IsOptional()
  @IsIn(["asc", "desc"], { message: 'order must be "asc" or "desc".' })
  order?: "asc" | "desc";
}
