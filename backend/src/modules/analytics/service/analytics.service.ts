import { Inject, Injectable } from "@nestjs/common";

import { ValidationFailedException } from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { AppConfig } from "../../../config/app-config";
import { addDays, isoDay, todayUtc } from "../../../common/utils/dates";
import { dateOnly } from "../../../common/validators/iso-date";
import type { AnalyticsQueryDto, AnalyticsResult } from "../dto/analytics.dto";
import { ANALYTICS_CACHE, type AnalyticsCache } from "../interfaces/analytics-cache";
import { AnalyticsRepository } from "../repository/analytics.repository";

export const MAX_RANGE_MONTHS = 24;
const DEFAULT_DAYS = 90;

/** A ratio, or null when there is nothing to divide by (never NaN, Infinity or a fake 0). */
export const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);
const percent = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);
const rounded = (value: number | null, digits = 1): number | null => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

/** The last allowed day: the same day-of-month 24 months on (clamped), so Jan 31 plus a month is the last day of February. */
export function latestAllowedEnd(from: Date): Date {
  const day = from.getUTCDate();
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + MAX_RANGE_MONTHS, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/**
 * Reports & analytics (Admin, Manager). Every figure is computed in the database for the chosen dates, with the caller's data
 * scope in the query. Results are cached for ANALYTICS_CACHE_SECONDS (60 by default) per caller and range, so a dashboard
 * that polls does not re-run the queries. Averages and percentages are null, not zero, when nothing underlies them.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly repo: AnalyticsRepository,
    private readonly config: AppConfig,
    @Inject(ANALYTICS_CACHE) private readonly cache: AnalyticsCache,
  ) {}

  async get(c: ActorContext, query: AnalyticsQueryDto): Promise<AnalyticsResult> {
    const today = todayUtc();
    const to = query.to ? dateOnly(query.to) : today;
    const from = query.from ? dateOnly(query.from) : addDays(to, -(DEFAULT_DAYS - 1));
    if (from > to) throw new ValidationFailedException([{ field: "to", message: "to can't be before from." }]);
    if (to > latestAllowedEnd(from)) {
      throw new ValidationFailedException([{ field: "to", message: `The range can't be longer than ${MAX_RANGE_MONTHS} months. Choose a shorter one.` }]);
    }

    const key = `analytics:${c.actor.role}:${c.actor.id}:${isoDay(from)}:${isoDay(to)}`;
    const ttl = this.config.env.ANALYTICS_CACHE_SECONDS;
    const hit = await this.cache.get(key);
    if (hit) return JSON.parse(hit) as AnalyticsResult;

    const result = await this.compute(c, from, to, today);
    await this.cache.set(key, JSON.stringify(result), ttl);
    return result;
  }

  private async compute(c: ActorContext, from: Date, lastDay: Date, today: Date): Promise<AnalyticsResult> {
    const actor = { id: c.actor.id, role: c.actor.role };
    const end = addDays(lastDay, 1); // exclusive upper bound: the whole last day counts
    const [byStage, byStatus, completed, completedByMonth, reviews, resolved, openTickets, reopened, tasksDone, tasksOpen, tasksOverdue, csrs, comps, csrFigures, compFigures, onboarding] =
      await Promise.all([
        this.repo.casesByStage(actor),
        this.repo.casesByStatus(actor),
        this.repo.completedCases(actor, from, end),
        this.repo.completedByMonth(actor, from, end),
        this.repo.documentReviews(actor, from, end),
        this.repo.resolvedTickets(actor, from, end),
        this.repo.openTickets(actor),
        this.repo.reopenedTickets(actor, from, end),
        this.repo.doneTasks(actor, from, end),
        this.repo.openTasks(actor),
        this.repo.overdueTasks(actor, today),
        this.repo.activeStaff("CSR"),
        this.repo.activeStaff("COMPLIANCE"),
        this.repo.csrFigures(from, end),
        this.repo.complianceFigures(from, end),
        this.repo.onboarding(actor),
      ]);

    const zeroCsr = { clients: 0, openFollowUps: 0, followUpsDone: 0, interactions: 0, openTickets: 0 };
    const zeroComp = { reviews: 0, ownedCases: 0, openTasks: 0, reportsTouched: 0 };
    return {
      range: { from: isoDay(from) as string, to: isoDay(lastDay) as string },
      generatedAt: new Date().toISOString(),
      cases: {
        byStage: byStage.filter((s) => s.count > 0).sort((a, b) => a.key.localeCompare(b.key)),
        byStatus: byStatus.sort((a, b) => a.key.localeCompare(b.key)),
        completed: completed.count,
        averageDaysToComplete: rounded(completed.avgDays),
        completedByMonth,
      },
      documentReviews: {
        reviewed: reviews.reviewed,
        averageHoursToReview: rounded(reviews.avgHours),
        sentBack: reviews.sentBack,
        sentBackRate: rounded(ratio(reviews.sentBack, reviews.reviewed), 3),
      },
      tickets: { resolved: resolved.resolved, averageHoursToResolve: rounded(resolved.avgHours), open: openTickets, reopened },
      tasks: { done: tasksDone, open: tasksOpen, overdue: tasksOverdue },
      csrs: csrs.map((u) => ({ id: u.id, name: u.name, ...(csrFigures.get(u.id) ?? zeroCsr) })),
      compliance: comps.map((u) => ({ id: u.id, name: u.name, ...(compFigures.get(u.id) ?? zeroComp) })),
      onboarding: {
        clients: onboarding.clients,
        steps: [
          { key: "acceptedInvitation", count: onboarding.accepted },
          { key: "caseOpened", count: onboarding.caseOpened },
          { key: "documentsUnderReviewOrLater", count: onboarding.reviewOrLater },
          { key: "formationCompleted", count: onboarding.completed },
        ].map((s) => ({ ...s, percent: percent(s.count, onboarding.clients) })),
      },
    };
  }
}
