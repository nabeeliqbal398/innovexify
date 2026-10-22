import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

import { MAX_PAGE_LIMIT } from "./pagination.dto";
import { ValidationFailedException } from "../exceptions";

export const DEFAULT_CURSOR_LIMIT = 30;

const CURSOR = /^[A-Za-z0-9_:.+-]{1,40}$/;
const CURSOR_MESSAGE = "must be the id of an item, or an ISO timestamp such as 2026-10-22T19:48:35.257Z.";

/**
 * Query for lists read by cursor (messages, notifications). `before` and `since` are either an item id or a timestamp.
 * Invalid values are rejected with a message on the field, never clamped.
 */
export class CursorQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_CURSOR_LIMIT })
  @Type(() => Number)
  @Max(MAX_PAGE_LIMIT, { message: `limit can't be more than ${MAX_PAGE_LIMIT}. Ask for a smaller page.` })
  @Min(1, { message: "limit must be 1 or greater." })
  @IsInt({ message: `limit must be a whole number from 1 to ${MAX_PAGE_LIMIT}.` })
  limit: number = DEFAULT_CURSOR_LIMIT;

  @ApiPropertyOptional({ description: "Read the page of items older than this item (id) or moment (timestamp)." })
  @IsOptional()
  @IsString({ message: `before ${CURSOR_MESSAGE}` })
  @MaxLength(40, { message: `before ${CURSOR_MESSAGE}` })
  @Matches(CURSOR, { message: `before ${CURSOR_MESSAGE}` })
  before?: string;

  @ApiPropertyOptional({ description: "Read items newer than this item (id) or moment (timestamp): for polling." })
  @IsOptional()
  @IsString({ message: `since ${CURSOR_MESSAGE}` })
  @MaxLength(40, { message: `since ${CURSOR_MESSAGE}` })
  @Matches(CURSOR, { message: `since ${CURSOR_MESSAGE}` })
  since?: string;
}

export type ParsedCursor = { kind: "time"; at: Date } | { kind: "id"; id: string };

const ISO_START = /^\d{4}-\d{2}-\d{2}T/;

/** A cursor is a timestamp when it looks like one (and is a real date), otherwise an item id. */
export function parseCursor(value: string, field: "before" | "since"): ParsedCursor {
  if (ISO_START.test(value)) {
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) throw new ValidationFailedException([{ field, message: `${field} isn't a real timestamp.` }]);
    return { kind: "time", at };
  }
  return { kind: "id", id: value };
}

/** `before` and `since` answer different questions (older page / newer items), so they can't be combined. */
export function assertOneDirection(query: Pick<CursorQueryDto, "before" | "since">): void {
  if (query.before !== undefined && query.since !== undefined) {
    throw new ValidationFailedException([{ field: "since", message: "Use either before (older items) or since (newer items), not both." }]);
  }
}
