import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  format,
  parseISO,
} from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { FamilyEvent } from "./models";
export const TIME_ZONE = "America/Los_Angeles";
export const pacificDate = (date = new Date()) =>
  formatInTimeZone(date, TIME_ZONE, "yyyy-MM-dd");
export type Occurrence = FamilyEvent & {
  eventId: string;
  occurrenceDate: string;
  start: string;
  end: string | null;
};
export function occurrences(
  eventId: string,
  event: FamilyEvent,
  from: string,
  through: string,
): Occurrence[] {
  const results: Occurrence[] = [];
  const base = parseISO(event.date);
  const begin = parseISO(from);
  let index = Math.max(
    0,
    (event.recurrence === "daily"
      ? differenceInCalendarDays(begin, base)
      : event.recurrence === "weekly"
        ? Math.floor(differenceInCalendarDays(begin, base) / 7)
        : event.recurrence === "monthly"
          ? differenceInCalendarMonths(begin, base)
          : event.recurrence === "yearly"
            ? differenceInCalendarYears(begin, base)
            : 0) - 1,
  );
  let iterations = 0;
  // Bound to a century to avoid unbounded recurrence expansion from malformed dates.
  while (iterations++ < 36600) {
    const current =
      event.recurrence === "daily"
        ? addDays(base, index)
        : event.recurrence === "weekly"
          ? addWeeks(base, index)
          : event.recurrence === "monthly"
            ? addMonths(base, index)
            : event.recurrence === "yearly"
              ? addYears(base, index)
              : base;
    const day = format(current, "yyyy-MM-dd");
    if (day > through || (event.until && day > event.until)) break;
    // Skip nonexistent month days, including February 29 in non-leap years.
    const valid =
      (event.recurrence !== "monthly" && event.recurrence !== "yearly") ||
      current.getDate() === base.getDate();
    if (day >= from && valid) {
      const exception = event.exceptions.find((e) => e.date === day);
      if (!exception?.cancelled) {
        const e = { ...event, ...exception?.patch, date: day };
        results.push({
          ...e,
          eventId,
          occurrenceDate: day,
          start: fromZonedTime(
            `${day}T${e.allDay ? "09:00" : e.time}:00`,
            TIME_ZONE,
          ).toISOString(),
          end:
            !e.allDay && e.endTime
              ? fromZonedTime(`${day}T${e.endTime}:00`, TIME_ZONE).toISOString()
              : null,
        });
      }
    }
    if (event.recurrence === "none") break;
    index++;
  }
  return results;
}
export function reminders(eventId: string, event: FamilyEvent, now: Date) {
  const start = pacificDate(new Date(now.getTime() - 2 * 86400000));
  const end = pacificDate(new Date(now.getTime() + 2 * 86400000));
  return occurrences(eventId, event, start, end)
    .flatMap((e) =>
      (e.allDay ? [0] : [1440, 60]).map((minutes) => ({
        key: `${eventId}:${e.occurrenceDate}:${e.start}:${minutes}`,
        due: new Date(new Date(e.start).getTime() - minutes * 60000),
        event: e,
      })),
    )
    .filter((r) => r.due <= now && r.due.getTime() > now.getTime() - 86400000);
}
