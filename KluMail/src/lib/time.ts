export function assertTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new Error("invalid timezone");
  }
}

export function formatInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function zonedDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = value("hour") === 24 ? 0 : value("hour");
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second"));
  return asUtc - instant.getTime();
}

export function zonedStartOfDayUtc(day: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error("invalid day");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const guess = new Date(Date.UTC(year, month - 1, date, 0, 0, 0));
  const offset = zoneOffsetMs(guess, timeZone);
  const start = new Date(guess.getTime() - offset);
  if (zonedDayKey(start, timeZone) !== day) {
    const corrected = zoneOffsetMs(start, timeZone);
    return new Date(guess.getTime() - corrected);
  }
  return start;
}

export function zonedRangeToUtc(fromDay: string, toDay: string, timeZone: string): { start: Date; end: Date } {
  const start = zonedStartOfDayUtc(fromDay, timeZone);
  const endDay = new Date(`${toDay}T00:00:00.000Z`);
  endDay.setUTCDate(endDay.getUTCDate() + 1);
  const next = endDay.toISOString().slice(0, 10);
  return { start, end: zonedStartOfDayUtc(next, timeZone) };
}

export function fillDailySeries(fromDay: string, toDay: string, rows: { day: string; count: number }[]): { day: string; count: number }[] {
  const counts = new Map(rows.map((row) => [row.day, row.count]));
  const result: { day: string; count: number }[] = [];
  const cursor = new Date(`${fromDay}T00:00:00.000Z`);
  const end = new Date(`${toDay}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.toISOString().slice(0, 10);
    result.push({ day, count: counts.get(day) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function recentRange(days: number, timeZone: string, now = new Date()): { from: string; to: string } {
  const to = zonedDayKey(now, timeZone);
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: zonedDayKey(start, timeZone), to };
}
