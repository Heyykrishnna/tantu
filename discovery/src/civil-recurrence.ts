import { Temporal } from "@js-temporal/polyfill";
import recurrence from "rrule";

export function expandCivilRecurrence(civilRule: string, timezone: string): string[] {
  const count = /(?:^|;)COUNT=(\d+)(?:;|$)/m.exec(civilRule)?.[1];
  if (/TZID/.test(civilRule) || !count || Number(count) > 1000 || Number(count) < 1) {
    throw new Error("The discovery adapter requires an explicit bounded civil recurrence and a separate timezone.");
  }

  return recurrence.rrulestr(civilRule).all().map((date) => {
    const civil = new Temporal.PlainDateTime(
      date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
      date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(),
    );
    return civil.toZonedDateTime(timezone, { disambiguation: "reject" }).toInstant().toString({ fractionalSecondDigits: 3 });
  });
}
