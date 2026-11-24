const dayMs = 86_400_000;

export function localDateKey(timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return (instant: number | Date) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
    return [parts.year, parts.month, parts.day].join('-');
  };
}

export function shiftCalendarDate(date: string, days: number) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * dayMs).toISOString().slice(0, 10);
}

export function calendarDays(from: string, to: string) {
  return (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / dayMs;
}

export function localDateBoundary(date: string, dateKey: ReturnType<typeof localDateKey>) {
  const nominal = Date.parse(date + 'T00:00:00Z');
  // A skipped local midnight starts at the first valid instant in the calendar day.
  let before = nominal - 36 * 3_600_000;
  let after = nominal + 36 * 3_600_000;
  while (after - before > 1) {
    const midpoint = Math.floor((before + after) / 2);
    if (dateKey(midpoint) < date) before = midpoint;
    else after = midpoint;
  }
  return new Date(after);
}
