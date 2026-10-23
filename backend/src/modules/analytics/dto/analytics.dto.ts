import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional } from "class-validator";

import { IsIsoDate } from "../../../common/validators/iso-date";

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ example: "2026-07-25", description: "First day (UTC). Default: 89 days before `to`, so the default range is 90 days." })
  @IsOptional()
  @IsIsoDate({ message: "from must be a real date as YYYY-MM-DD." })
  from?: string;

  @ApiPropertyOptional({ example: "2026-10-22", description: "Last day, included (UTC). Default: today. The range can't be longer than 24 months." })
  @IsOptional()
  @IsIsoDate({ message: "to must be a real date as YYYY-MM-DD." })
  to?: string;
}

export class CountDto {
  @ApiProperty() key!: string;
  @ApiProperty() count!: number;
}

export class MonthDto {
  @ApiProperty({ example: "2026-09" }) month!: string;
  @ApiProperty() count!: number;
}

export interface AnalyticsResult {
  range: { from: string; to: string };
  generatedAt: string;
  cases: {
    byStage: CountDto[];
    byStatus: CountDto[];
    completed: number;
    averageDaysToComplete: number | null;
    completedByMonth: MonthDto[];
  };
  documentReviews: { reviewed: number; averageHoursToReview: number | null; sentBack: number; sentBackRate: number | null };
  tickets: { resolved: number; averageHoursToResolve: number | null; open: number; reopened: number };
  tasks: { done: number; open: number; overdue: number };
  csrs: Array<{ id: string; name: string; clients: number; openFollowUps: number; followUpsDone: number; interactions: number; openTickets: number }>;
  compliance: Array<{ id: string; name: string; reviews: number; ownedCases: number; openTasks: number; reportsTouched: number }>;
  onboarding: { clients: number; steps: Array<{ key: string; count: number; percent: number | null }> };
}
