import { z } from 'zod';
import { BadRequestError } from '../utils/errors';
import { calendarDays, localDateBoundary, localDateKey, shiftCalendarDate } from './reportingDates';

const presets = ['last7', 'last30', 'last90', 'thisMonth', 'previousMonth', 'custom'] as const;
export const businessRangeSchema = z.strictObject({
  range: z.enum(presets).default('last30'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
}).refine(({ range, from, to }) => (
  range === 'custom' ? Boolean(from && to) : !from && !to
), 'Use both dates with the custom range only.');

export type BusinessRange = z.output<typeof businessRangeSchema>;
export type BusinessPeriod = { from: string; to: string; start: Date; end: Date };

export function businessGrowthBuckets(period: Pick<BusinessPeriod, 'from' | 'to'>) {
  const days = calendarDays(period.from, period.to) + 1;
  const step = days <= 31 ? 1 : 7;
  const buckets = Array.from({ length: Math.ceil(days / step) }, (_, index) => ({
    from: shiftCalendarDate(period.from, index * step),
    to: shiftCalendarDate(period.from, Math.min(days - 1, (index + 1) * step - 1)),
  }));
  return { buckets, indexForDate: (date: string) => Math.floor(calendarDays(period.from, date) / step) };
}

export function businessGrowthPeriods(selection: BusinessRange, timezone: string, now: Date) {
  const dateKey = localDateKey(timezone);
  const today = dateKey(now);
  const monthStart = today.slice(0, 7) + '-01';
  const previousMonthEnd = shiftCalendarDate(monthStart, -1);
  const previousMonthStart = previousMonthEnd.slice(0, 7) + '-01';
  const olderMonthEnd = shiftCalendarDate(previousMonthStart, -1);
  const olderMonthStart = olderMonthEnd.slice(0, 7) + '-01';
  let from: string;
  let to = today;
  const range = selection.range;
  if (range === 'custom') {
    from = selection.from!;
    to = selection.to!;
    if (from < '1900-01-01' || from > to || to > today || calendarDays(from, to) >= 366) {
      throw new BadRequestError('Choose up to 366 days from 1900 onward, ending on or before today.');
    }
  } else if (range === 'previousMonth') {
    from = previousMonthStart;
    to = previousMonthEnd;
  } else if (range === 'thisMonth') {
    from = monthStart;
  } else {
    from = shiftCalendarDate(today, -(range === 'last7' ? 6 : range === 'last90' ? 89 : 29));
  }

  const period = (startDate: string, endDate: string): BusinessPeriod => ({
    from: startDate, to: endDate,
    start: localDateBoundary(startDate, dateKey),
    end: localDateBoundary(shiftCalendarDate(endDate, 1), dateKey),
  });
  const current = period(from, to);
  const elapsedDays = calendarDays(from, to);
  let previous: BusinessPeriod;
  if (range === 'thisMonth') {
    previous = period(previousMonthStart, shiftCalendarDate(previousMonthStart,
      Math.min(elapsedDays, calendarDays(previousMonthStart, previousMonthEnd))));
  } else if (range === 'previousMonth') {
    previous = period(olderMonthStart, olderMonthEnd);
  } else {
    previous = period(shiftCalendarDate(from, -elapsedDays - 1), shiftCalendarDate(from, -1));
  }
  const comparable = range !== 'thisMonth' || calendarDays(previous.from, previous.to) === elapsedDays;
  const partialToday = to === today;
  if (partialToday) {
    current.end = now;
    if (comparable) {
      // Compare the same elapsed time after local midnight.
      const elapsed = now.getTime() - localDateBoundary(today, dateKey).getTime();
      const previousMidnight = localDateBoundary(previous.to, dateKey).getTime();
      previous.end = new Date(Math.min(previous.end.getTime(), previousMidnight + elapsed));
    }
  }
  return { current, previous, today, partialToday, comparable, dateKey, timezone };
}
