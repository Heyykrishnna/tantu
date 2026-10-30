import { Temporal } from "@js-temporal/polyfill";
import recurrence from "rrule";
import { Failure } from "../../platform/failure.js";

export function civilInstant(value: string, timezone: string): string {
  try { return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone, { disambiguation: "reject" }).toInstant().toString({ fractionalSecondDigits: 3 }); }
  catch { throw new Failure(400, "INVALID_CIVIL_TIME", "Use a valid IANA timezone and an unambiguous local time. Daylight-saving gaps and repeated times require a different selection."); }
}
export function expandCivilRecurrence(rule: string, timezone: string): string[] {
  const count = /(?:^|;)COUNT=(\d+)(?:;|$)/m.exec(rule)?.[1];
  if (/TZID|UNTIL|SECONDLY|MINUTELY|HOURLY/.test(rule) || !count || Number(count) > 1000 || Number(count) < 1 || !/^DTSTART:\d{8}T\d{6}Z?\nRRULE:/.test(rule)) throw new Failure(400, "INVALID_RECURRENCE", "Use DTSTART and a daily, weekly, monthly or yearly RRULE with COUNT between 1 and 1000 and a separate IANA timezone.");
  try {
    return recurrence.rrulestr(rule).all().map((date) => civilInstant(new Temporal.PlainDateTime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()).toString(), timezone));
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw new Failure(400, "INVALID_RECURRENCE", "The recurrence rule could not be expanded.");
  }
}
