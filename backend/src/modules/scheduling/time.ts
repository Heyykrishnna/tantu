import { Temporal } from "@js-temporal/polyfill";
import recurrence from "rrule";
import { Failure } from "../../platform/failure.js";

export function civilInstant(value: string, timezone: string): string {
  try { return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone, { disambiguation: "reject" }).toInstant().toString({ fractionalSecondDigits: 3 }); }
  catch { throw new Failure(400, "INVALID_CIVIL_TIME", "Use a valid IANA timezone and an unambiguous local time. Daylight-saving gaps and repeated times require a different selection."); }
}
export function expandCivilRecurrence(rule: string, timezone: string): string[] {
  const lines = rule.split("\n");
  const parts = lines[1]?.replace(/^RRULE:/, "").split(";") ?? [];
  const entries = parts.map((part) => part.split("="));
  const values = new Map(entries.map((entry) => [entry[0], entry[1]]));
  const count = Number(values.get("COUNT")); const interval = Number(values.get("INTERVAL") ?? "1");
  const valid = lines.length === 2 && /^DTSTART:\d{8}T\d{6}Z?$/.test(lines[0] ?? "") && lines[1]?.startsWith("RRULE:") && entries.every((entry) => entry.length === 2 && ["FREQ", "COUNT", "INTERVAL"].includes(entry[0] ?? "")) && values.size === entries.length && ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(values.get("FREQ") ?? "") && Number.isInteger(count) && count >= 1 && count <= 1000 && Number.isInteger(interval) && interval >= 1 && interval <= 366;
  if (!valid) throw new Failure(400, "INVALID_RECURRENCE", "Use a single DTSTART and daily, weekly, monthly or yearly RRULE with COUNT 1–1000, optional INTERVAL 1–366, and a separate IANA timezone. Extra rules and advanced selectors are unsupported.");
  try {
    return recurrence.rrulestr(rule).all().map((date) => civilInstant(new Temporal.PlainDateTime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()).toString(), timezone));
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw new Failure(400, "INVALID_RECURRENCE", "The recurrence rule could not be expanded.");
  }
}
