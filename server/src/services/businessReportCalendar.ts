import { z } from 'zod';
import { BadRequestError } from '../utils/errors';
import { calendarDays, localDateBoundary, localDateKey, shiftCalendarDate } from './reportingDates';
import type { BusinessPeriod, businessGrowthPeriods } from './businessGrowthCalendar';

export const businessReportRequest = z.strictObject({
  kind: z.enum(['weekly', 'monthly']),
  date: z.iso.date().optional(),
});
export type BusinessReportRequest = z.output<typeof businessReportRequest>;

export function businessReportPeriods(input: BusinessReportRequest, timezone: string, now: Date): ReturnType<typeof businessGrowthPeriods> {
  const dateKey = localDateKey(timezone);
  const today = dateKey(now);
  const anchor = input.date ?? today;
  if (anchor < '1900-01-01' || anchor > today) {
    throw new BadRequestError('Choose a report date from 1900 onward, through today in the reporting time zone.');
  }
  const weekly = input.kind === 'weekly';
  const offset = (new Date(anchor + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const from = weekly ? shiftCalendarDate(anchor, -offset) : anchor.slice(0, 7) + '-01';
  const nextMonth = new Date(from + 'T00:00:00Z');
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const fullEnd = weekly ? shiftCalendarDate(from, 6) : shiftCalendarDate(nextMonth.toISOString().slice(0, 10), -1);
  const priorEnd = shiftCalendarDate(from, -1);
  const priorStart = weekly ? shiftCalendarDate(from, -7) : priorEnd.slice(0, 7) + '-01';
  const to = today < fullEnd ? today : fullEnd;
  const partialToday = to === today;
  const elapsed = calendarDays(from, to);
  const comparable = !partialToday || elapsed <= calendarDays(priorStart, priorEnd);
  const previousTo = partialToday && comparable ? shiftCalendarDate(priorStart, elapsed) : priorEnd;
  const period = (start: string, end: string): BusinessPeriod => ({
    from: start, to: end, start: localDateBoundary(start, dateKey), end: localDateBoundary(shiftCalendarDate(end, 1), dateKey),
  });
  const current = period(from, to);
  const previous = period(priorStart, previousTo);
  if (partialToday) {
    current.end = now;
    if (comparable) {
      const partialMs = now.getTime() - localDateBoundary(today, dateKey).getTime();
      previous.end = new Date(Math.min(previous.end.getTime(), localDateBoundary(previous.to, dateKey).getTime() + partialMs));
    }
  }
  return { timezone, today, current, previous, comparable, partialToday, dateKey };
}
