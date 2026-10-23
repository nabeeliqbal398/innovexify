import { Injectable } from "@nestjs/common";

import { ValidationFailedException } from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { addDays, isoDay, todayUtc } from "../../../common/utils/dates";
import { dateOnly } from "../../../common/validators/iso-date";
import type { CalendarDto, CalendarItemDto, CalendarQueryDto } from "../dto/calendar.dto";
import { CAP, CalendarRepository, CHASE_AFTER_DAYS } from "../repository/calendar.repository";

const MAX_DAYS = 400;

/**
 * The Compliance calendar: case target dates, filing follow-ups, document chases (7 days after an unanswered request), compliance
 * tasks and the illustrative reminders, for the days asked for. Everything is read under the caller's scope. Dates are the server's
 * calendar days; "overdue" means before the server's today.
 */
@Injectable()
export class CalendarService {
  constructor(private readonly repo: CalendarRepository) {}

  async get(c: ActorContext, query: CalendarQueryDto): Promise<CalendarDto> {
    const from = dateOnly(query.from);
    const last = dateOnly(query.to);
    if (last < from) throw new ValidationFailedException([{ field: "to", message: "to can't be before from." }]);
    if ((last.getTime() - from.getTime()) / 86_400_000 > MAX_DAYS) {
      throw new ValidationFailedException([{ field: "to", message: `Ask for at most ${MAX_DAYS} days at a time.` }]);
    }
    const w = { from, to: addDays(last, 1) };
    const actor = { id: c.actor.id, role: c.actor.role };
    const today = todayUtc();
    const isLate = (date: string): boolean => date < (isoDay(today) as string);

    const [cases, filings, missing, tasks, reminders, overdueTotal] = await Promise.all([
      this.repo.cases(actor, w),
      this.repo.filings(actor, w),
      this.repo.missing(actor, w),
      this.repo.tasks(actor, w),
      this.repo.reminders(actor, w),
      this.repo.overdue(actor, today),
    ]);

    const items: CalendarItemDto[] = [
      ...cases.map((x) => item("case", x.id, isoDay(x.deadline) as string, "", x.client.name, x.id, x.number, null, isLate)),
      ...filings.map((x) => item("filing", x.id, isoDay(x.nextActionDate) as string, x.nextAction, x.case.client.name, x.case.id, x.case.number, null, isLate)),
      ...missing.map((x) => item("missing", x.id, isoDay(addDays(x.requestedAt, CHASE_AFTER_DAYS)) as string, x.name, x.client.name, null, null, x.id, isLate)),
      ...tasks.map((x) => item("task", x.id, isoDay(x.due) as string, x.title, x.case.client.name, x.case.id, x.case.number, null, isLate)),
      ...reminders.map((x) => item("reminder", x.id, isoDay(x.date) as string, x.title, x.case.client.name, x.case.id, x.case.number, null, isLate)),
    ].sort((a, b) => (a.date === b.date ? a.key.localeCompare(b.key) : a.date < b.date ? -1 : 1));

    const truncated = [cases, filings, missing, tasks, reminders].some((list) => list.length >= CAP);
    return { items, overdueTotal, truncated };
  }
}

function item(
  kind: CalendarItemDto["kind"],
  id: string,
  date: string,
  title: string,
  clientName: string | null,
  caseId: string | null,
  caseNumber: number | null,
  documentId: string | null,
  isLate: (date: string) => boolean,
): CalendarItemDto {
  return {
    key: `${kind}:${id}`,
    kind,
    date,
    title,
    clientName,
    caseId,
    caseDisplay: caseNumber === null ? null : `PRJ-${caseNumber}`,
    documentId: kind === "missing" ? id : documentId,
    overdue: isLate(date),
  };
}
