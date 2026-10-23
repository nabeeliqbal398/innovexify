import { ApiProperty } from "@nestjs/swagger";

import { IsIsoDate } from "../../../common/validators/iso-date";

export const CALENDAR_KINDS = ["case", "filing", "missing", "task", "reminder"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export class CalendarQueryDto {
  @ApiProperty({ example: "2026-10-01", description: "First day shown (YYYY-MM-DD)." })
  @IsIsoDate({ message: "from must be a real date as YYYY-MM-DD." })
  from!: string;

  @ApiProperty({ example: "2026-11-15", description: "Last day shown, included. At most 400 days after from." })
  @IsIsoDate({ message: "to must be a real date as YYYY-MM-DD." })
  to!: string;
}

export class CalendarItemDto {
  @ApiProperty({ description: "Unique within the response, such as case:abc." }) key!: string;
  @ApiProperty({ enum: CALENDAR_KINDS }) kind!: CalendarKind;
  @ApiProperty({ example: "2026-11-03" }) date!: string;
  @ApiProperty({ description: "A task title, a filing's next action, a document name or a reminder title; empty for a case target date." }) title!: string;
  @ApiProperty({ nullable: true }) clientName!: string | null;
  @ApiProperty({ nullable: true, description: "The case this belongs to (not for a missing document)." }) caseId!: string | null;
  @ApiProperty({ nullable: true, example: "PRJ-118" }) caseDisplay!: string | null;
  @ApiProperty({ nullable: true, description: "For a missing document: its id." }) documentId!: string | null;
  @ApiProperty({ description: "The date is before the server's today." }) overdue!: boolean;
}

export class CalendarDto {
  @ApiProperty({ type: [CalendarItemDto] }) items!: CalendarItemDto[];
  @ApiProperty({ description: "Items of every kind dated before today, wherever they fall (not only in this window)." }) overdueTotal!: number;
  @ApiProperty({ description: "True when a kind hit the 500-item cap for this window." }) truncated!: boolean;
}
